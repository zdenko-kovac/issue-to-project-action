import { describe, test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock @actions/core and @actions/github before importing main
const coreMock = {
  getInput: mock.fn<(name: string, opts?: { required?: boolean }) => string>(
    () => "",
  ),
  info: mock.fn<(msg: string) => void>(() => {}),
  warning: mock.fn<(msg: string) => void>(() => {}),
  setFailed: mock.fn<(msg: string) => void>(() => {}),
  setOutput: mock.fn<(name: string, value: string) => void>(() => {}),
};

const githubMock = {
  context: {
    eventName: "issues" as string,
    payload: {
      action: "opened",
      issue: {
        number: 42,
        title: "Test issue",
        node_id: "I_node42",
      },
    } as any,
    repo: { owner: "test-org", repo: "test-repo" },
  },
  getOctokit: mock.fn(() => ({
    graphql: async () => ({
      addProjectV2ItemById: { item: { id: "PVTI_item1" } },
    }),
  })),
};

// We use a simpler approach: mock the module cache
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;

const moduleOverrides: Record<string, unknown> = {
  "@actions/core": coreMock,
  "@actions/github": githubMock,
};

Module._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
) {
  if (moduleOverrides[request]) return request;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Pre-populate require cache with mocks
for (const [name, impl] of Object.entries(moduleOverrides)) {
  require.cache[name] = {
    id: name,
    filename: name,
    loaded: true,
    exports: impl,
  } as any;
}

function resetMocks() {
  coreMock.getInput.mock.resetCalls();
  coreMock.info.mock.resetCalls();
  coreMock.warning.mock.resetCalls();
  coreMock.setFailed.mock.resetCalls();
  coreMock.setOutput.mock.resetCalls();
  githubMock.getOctokit.mock.resetCalls();

  // Reset context to default valid state
  githubMock.context.eventName = "issues";
  githubMock.context.payload = {
    action: "opened",
    issue: {
      number: 42,
      title: "Test issue",
      node_id: "I_node42",
    },
  };

  // Reset getInput to return project-node-id and github-token
  coreMock.getInput.mock.mockImplementation((name: string) => {
    if (name === "project-node-id") return "PVT_proj1";
    if (name === "github-token") return "ghp_test123";
    return "";
  });

  // Reset getOctokit to return a successful mock
  githubMock.getOctokit.mock.mockImplementation(() => ({
    graphql: async () => ({
      addProjectV2ItemById: { item: { id: "PVTI_item1" } },
    }),
  }));
}

// Clear main module from cache before each test so run() re-executes
function clearMainCache() {
  const mainPath = require.resolve("./main");
  delete require.cache[mainPath];
}

describe("main — event gating", () => {
  beforeEach(() => {
    resetMocks();
    clearMainCache();
  });

  test("skips non-issues events with a warning", async () => {
    githubMock.context.eventName = "push";
    githubMock.context.payload = { action: "completed" };

    await require("./main");
    // Give the catch handler time to run
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coreMock.warning.mock.callCount(), 1);
    assert.match(
      coreMock.warning.mock.calls[0].arguments[0] as string,
      /push\.completed/,
    );
    assert.equal(coreMock.setFailed.mock.callCount(), 0);
  });

  test("skips non-opened issue events with a warning", async () => {
    githubMock.context.eventName = "issues";
    githubMock.context.payload = { action: "closed" };

    await require("./main");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coreMock.warning.mock.callCount(), 1);
    assert.match(
      coreMock.warning.mock.calls[0].arguments[0] as string,
      /issues\.closed/,
    );
  });

  test("fails when issue is missing from payload", async () => {
    githubMock.context.eventName = "issues";
    githubMock.context.payload = { action: "opened" };
    // no issue property

    await require("./main");
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(coreMock.setFailed.mock.callCount(), 1);
    assert.match(
      coreMock.setFailed.mock.calls[0].arguments[0] as string,
      /No issue found/,
    );
  });
});

describe("main — successful execution", () => {
  beforeEach(() => {
    resetMocks();
    clearMainCache();
  });

  test("adds issue to project and sets output", async () => {
    await require("./main");
    await new Promise((r) => setTimeout(r, 10));

    // Should have called getOctokit with the token
    assert.equal(githubMock.getOctokit.mock.callCount(), 1);
    assert.equal(
      (githubMock.getOctokit.mock.calls[0].arguments as unknown[])[0],
      "ghp_test123",
    );

    // Should log the issue label
    const infoCalls = coreMock.info.mock.calls.map(
      (c) => c.arguments[0] as string,
    );
    assert.ok(
      infoCalls.some((msg) => msg.includes("test-org/test-repo#42")),
      "Should log the issue label",
    );

    // Should set the item-id output
    assert.equal(coreMock.setOutput.mock.callCount(), 1);
    assert.equal(coreMock.setOutput.mock.calls[0].arguments[0], "item-id");
    assert.equal(
      coreMock.setOutput.mock.calls[0].arguments[1],
      "PVTI_item1",
    );
  });

  test("logs the issue title", async () => {
    await require("./main");
    await new Promise((r) => setTimeout(r, 10));

    const infoCalls = coreMock.info.mock.calls.map(
      (c) => c.arguments[0] as string,
    );
    assert.ok(
      infoCalls.some((msg) => msg.includes("Test issue")),
      "Should log the issue title",
    );
  });
});

describe("main — error handling", () => {
  beforeEach(() => {
    resetMocks();
    clearMainCache();
  });

  test("calls setFailed when graphql mutation throws a non-retryable error", async () => {
    githubMock.getOctokit.mock.mockImplementation(() => ({
      graphql: async () => {
        throw new Error("Not found");
      },
    }));

    require("./main");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(coreMock.setFailed.mock.callCount(), 1);
    assert.match(
      coreMock.setFailed.mock.calls[0].arguments[0] as string,
      /Not found/,
    );
  });
});
