import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { addIssueToProject, isRetryable } from "./add-to-project";

function makeMockOctokit(graphqlImpl: (...args: unknown[]) => unknown) {
  return { graphql: graphqlImpl } as any;
}

const FAST_RETRY = { baseDelayMs: 1 };

describe("addIssueToProject", () => {
  test("calls graphql with correct mutation variables", async () => {
    const graphql = mock.fn(async () => ({
      addProjectV2ItemById: { item: { id: "PVTI_item123" } },
    }));

    const result = await addIssueToProject({
      projectNodeId: "PVT_proj1",
      issueNodeId: "I_issue1",
      octokit: makeMockOctokit(graphql),
    });

    assert.equal(result.itemId, "PVTI_item123");
    assert.equal(graphql.mock.callCount(), 1);

    const callArgs = graphql.mock.calls[0].arguments as unknown as [string, Record<string, string>];
    const [mutation, variables] = callArgs;
    assert.match(mutation, /addProjectV2ItemById/);
    assert.equal(variables.projectId, "PVT_proj1");
    assert.equal(variables.contentId, "I_issue1");
  });

  test("returns the item ID from the response", async () => {
    const graphql = async () => ({
      addProjectV2ItemById: { item: { id: "PVTI_abc" } },
    });

    const result = await addIssueToProject({
      projectNodeId: "PVT_1",
      issueNodeId: "I_1",
      octokit: makeMockOctokit(graphql),
    });

    assert.equal(result.itemId, "PVTI_abc");
  });
});

describe("isRetryable", () => {
  test("returns false for 'not authorized' errors", () => {
    assert.equal(isRetryable(new Error("Not authorized to access project")), false);
  });

  test("returns false for 'forbidden' errors", () => {
    assert.equal(isRetryable(new Error("Forbidden")), false);
  });

  test("returns false for 'bad credentials' errors", () => {
    assert.equal(isRetryable(new Error("Bad credentials")), false);
  });

  test("returns false for 'not found' errors", () => {
    assert.equal(isRetryable(new Error("Not found")), false);
  });

  test("returns true for transient errors", () => {
    assert.equal(isRetryable(new Error("Internal server error")), true);
    assert.equal(isRetryable(new Error("ETIMEDOUT")), true);
    assert.equal(isRetryable(new Error("socket hang up")), true);
  });
});

describe("retry logic", () => {
  test("retries on transient errors up to 3 times", async () => {
    let attempts = 0;
    const graphql = async () => {
      attempts++;
      if (attempts < 3) throw new Error("Server error");
      return { addProjectV2ItemById: { item: { id: "PVTI_ok" } } };
    };

    const result = await addIssueToProject({
      projectNodeId: "PVT_1",
      issueNodeId: "I_1",
      octokit: makeMockOctokit(graphql),
      ...FAST_RETRY,
    });

    assert.equal(result.itemId, "PVTI_ok");
    assert.equal(attempts, 3);
  });

  test("does not retry on non-retryable errors", async () => {
    let attempts = 0;
    const graphql = async () => {
      attempts++;
      throw new Error("Not authorized to access project");
    };

    await assert.rejects(
      () =>
        addIssueToProject({
          projectNodeId: "PVT_1",
          issueNodeId: "I_1",
          octokit: makeMockOctokit(graphql),
          ...FAST_RETRY,
        }),
      { message: /Not authorized/ },
    );
    assert.equal(attempts, 1);
  });

  test("throws after all retries are exhausted", async () => {
    let attempts = 0;
    const graphql = async () => {
      attempts++;
      throw new Error("Internal server error");
    };

    await assert.rejects(
      () =>
        addIssueToProject({
          projectNodeId: "PVT_1",
          issueNodeId: "I_1",
          octokit: makeMockOctokit(graphql),
          ...FAST_RETRY,
        }),
      { message: /Internal server error/ },
    );
    assert.equal(attempts, 3);
  });

  test("uses exponential backoff between retries", async () => {
    const timestamps: number[] = [];
    let attempts = 0;

    const graphql = async () => {
      attempts++;
      timestamps.push(Date.now());
      if (attempts < 3) throw new Error("Timeout");
      return { addProjectV2ItemById: { item: { id: "PVTI_ok" } } };
    };

    await addIssueToProject({
      projectNodeId: "PVT_1",
      issueNodeId: "I_1",
      octokit: makeMockOctokit(graphql),
      baseDelayMs: 50, // 50ms base so delays are 50ms, 100ms — fast but measurable
    });

    assert.equal(timestamps.length, 3);
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];
    // Allow some tolerance for timer precision
    assert.ok(delay1 >= 40, `First delay ${delay1}ms should be ~50ms`);
    assert.ok(delay2 >= 80, `Second delay ${delay2}ms should be ~100ms`);
    assert.ok(delay2 > delay1, "Second delay should be longer (exponential)");
  });
});
