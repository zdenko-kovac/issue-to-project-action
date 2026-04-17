import type { Octokit } from "@octokit/core";
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
export declare function isRetryable(err: Error): boolean;
export declare function addIssueToProject(opts: AddToProjectOptions): Promise<AddToProjectResult>;
