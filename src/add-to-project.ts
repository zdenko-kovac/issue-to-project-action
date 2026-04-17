import type { Octokit } from "@octokit/core";

const ADD_TO_PROJECT_MUTATION = `
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item { id }
    }
  }
`;

export interface AddToProjectOptions {
  projectNodeId: string;
  issueNodeId: string;
  octokit: Octokit;
  /** Base delay in ms for retry backoff. Defaults to 1000. */
  baseDelayMs?: number;
}

export interface AddToProjectResult {
  itemId: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const NON_RETRYABLE_PATTERNS = [
  "not authorized",
  "forbidden",
  "bad credentials",
  "not found",
];

export function isRetryable(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return !NON_RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRIES,
  baseDelay: number = BASE_DELAY_MS,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxAttempts || !isRetryable(lastError)) {
        throw lastError;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function addIssueToProject(
  opts: AddToProjectOptions,
): Promise<AddToProjectResult> {
  const result = await retry(() =>
    opts.octokit.graphql<{
      addProjectV2ItemById: { item: { id: string } };
    }>(ADD_TO_PROJECT_MUTATION, {
      projectId: opts.projectNodeId,
      contentId: opts.issueNodeId,
    }),
    MAX_RETRIES,
    opts.baseDelayMs ?? BASE_DELAY_MS,
  );

  return { itemId: result.addProjectV2ItemById.item.id };
}
