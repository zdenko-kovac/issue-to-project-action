import { Octokit } from "@octokit/rest";

const WORKFLOW_PATH = ".github/workflows/issue-to-project.yml";

function buildWorkflowContent(projectNodeId: string, actionRef: string): string {
  return `name: Add issue to project

on:
  issues:
    types: [opened]

jobs:
  add-to-project:
    runs-on: ubuntu-latest
    steps:
      - uses: ${actionRef}
        with:
          project-node-id: "${projectNodeId}"
          github-token: \${{ secrets.PROJECT_TOKEN }}
`;
}

interface Repo {
  name: string;
  archived: boolean;
  disabled: boolean;
}

async function main(): Promise<void> {
  const required = ["GITHUB_TOKEN", "GITHUB_ORG", "PROJECT_NODE_ID"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error(`
Usage:
  GITHUB_TOKEN=<pat> GITHUB_ORG=<org> PROJECT_NODE_ID=<id> npm run distribute-workflow

Optional:
  ACTION_REF   Action reference (default: zdenko-kovac/issue-to-project-action@v1)
  GHE_HOST     GitHub Enterprise hostname (e.g. github.example.com)
  DRY_RUN=1    Preview changes without writing`);
    process.exit(1);
  }

  const org = process.env.GITHUB_ORG!;
  const projectNodeId = process.env.PROJECT_NODE_ID!;
  const actionRef = process.env.ACTION_REF ?? "zdenko-kovac/issue-to-project-action@v1";
  const dryRun = process.env.DRY_RUN === "1";

  const gheHost = process.env.GHE_HOST;
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    ...(gheHost ? { baseUrl: `https://${gheHost}/api/v3` } : {}),
  });
  const content = buildWorkflowContent(projectNodeId, actionRef);
  const encoded = Buffer.from(content).toString("base64");

  if (dryRun) {
    console.log("=== DRY RUN — no changes will be made ===\n");
    console.log("Workflow content:");
    console.log(content);
  }

  console.log(`Distributing workflow to all repos in: ${org}${gheHost ? ` (${gheHost})` : ""}`);
  console.log(`Project Node ID: ${projectNodeId}`);
  console.log(`Action ref: ${actionRef}\n`);

  // Detect whether the login is an org or user
  let isOrg = true;
  try {
    await octokit.orgs.get({ org });
  } catch {
    isOrg = false;
  }

  console.log(`Account type: ${isOrg ? "organization" : "user"}\n`);

  let page = 1;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const { data: repos } = isOrg
      ? await octokit.repos.listForOrg({ org, type: "all", per_page: 100, page })
      : await octokit.repos.listForUser({ username: org, per_page: 100, page });

    if (repos.length === 0) break;

    for (const repo of repos as Repo[]) {
      if (repo.archived || repo.disabled) {
        console.log(`  SKIP  ${repo.name} (archived/disabled)`);
        skipped++;
        continue;
      }

      // Check if workflow already exists
      let existingSha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({
          owner: org,
          repo: repo.name,
          path: WORKFLOW_PATH,
        });
        if (!Array.isArray(data) && data.type === "file") {
          // Already has the same content — skip
          if (data.content?.replace(/\n/g, "") === encoded) {
            console.log(`  SKIP  ${repo.name} (already up to date)`);
            skipped++;
            continue;
          }
          existingSha = data.sha;
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status !== 404) throw err;
        // File doesn't exist yet — will create
      }

      if (dryRun) {
        console.log(`  ${existingSha ? "UPDATE" : "CREATE"}  ${repo.name}`);
        existingSha ? updated++ : created++;
        continue;
      }

      await octokit.repos.createOrUpdateFileContents({
        owner: org,
        repo: repo.name,
        path: WORKFLOW_PATH,
        message: "ci: add issue-to-project workflow",
        content: encoded,
        ...(existingSha ? { sha: existingSha } : {}),
      });

      console.log(`  ${existingSha ? "UPDATE" : "CREATE"}  ${repo.name}`);
      existingSha ? updated++ : created++;
    }

    page++;
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
