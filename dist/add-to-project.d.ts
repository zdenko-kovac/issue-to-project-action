import type { Octokit } from "@octokit/core";
export interface AddToProjectOptions {
    projectNodeId: string;
    issueNodeId: string;
    octokit: Octokit;
}
export interface AddToProjectResult {
    itemId: string;
}
export declare function addIssueToProject(opts: AddToProjectOptions): Promise<AddToProjectResult>;
