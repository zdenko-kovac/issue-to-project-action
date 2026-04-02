import * as core from "@actions/core";
import * as github from "@actions/github";
import { addIssueToProject } from "./add-to-project";

async function run(): Promise<void> {
  const { context } = github;

  if (context.eventName !== "issues" || context.payload.action !== "opened") {
    core.warning(
      `Skipping: expected issues.opened event, got ${context.eventName}.${context.payload.action}`,
    );
    return;
  }

  const issue = context.payload.issue;
  if (!issue) {
    core.setFailed("No issue found in event payload");
    return;
  }

  const projectNodeId = core.getInput("project-node-id", { required: true });
  const token = core.getInput("github-token", { required: true });
  const octokit = github.getOctokit(token);

  const label = `${context.repo.owner}/${context.repo.repo}#${issue.number}`;
  core.info(`New issue opened: ${label} — "${issue.title}"`);

  const result = await addIssueToProject({
    projectNodeId,
    issueNodeId: issue.node_id,
    octokit,
  });

  core.info(`Added ${label} to project, item ID: ${result.itemId}`);
  core.setOutput("item-id", result.itemId);
}

run().catch((err) => {
  core.setFailed((err as Error).message);
});
