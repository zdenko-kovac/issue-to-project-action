import { graphql } from "@octokit/graphql";

const ORG_PROJECTS_QUERY = `
  query($login: String!, $after: String) {
    organization(login: $login) {
      projectsV2(first: 20, after: $after) {
        nodes { id title number }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const USER_PROJECTS_QUERY = `
  query($login: String!, $after: String) {
    user(login: $login) {
      projectsV2(first: 20, after: $after) {
        nodes { id title number }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

interface ProjectNode {
  id: string;
  title: string;
  number: number;
}

interface ProjectsPage {
  nodes: ProjectNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

async function main(): Promise<void> {
  const titleFilter = process.argv[2];

  const required = ["GITHUB_TOKEN", "GITHUB_ORG"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const login = process.env.GITHUB_ORG!;
  const client = graphql.defaults({
    headers: { authorization: `token ${process.env.GITHUB_TOKEN}` },
  });

  // Detect whether the login is an org or user
  let query = ORG_PROJECTS_QUERY;
  let ownerType: "organization" | "user" = "organization";
  try {
    await client(ORG_PROJECTS_QUERY, { login, after: undefined });
  } catch {
    query = USER_PROJECTS_QUERY;
    ownerType = "user";
  }

  if (titleFilter) {
    console.log(`Projects matching "${titleFilter}" for ${ownerType}: ${login}\n`);
  } else {
    console.log(`Projects for ${ownerType}: ${login}\n`);
  }

  console.log(["#", "Number", "Node ID", "Title"].join("\t"));
  console.log("-".repeat(80));

  let after: string | null = null;
  let row = 0;

  do {
    const result: Record<string, { projectsV2: ProjectsPage }> = await client(
      query,
      { login, after: after ?? undefined },
    );

    const owner = result[ownerType];
    const { nodes, pageInfo } = owner.projectsV2;

    for (const proj of nodes) {
      if (titleFilter && !proj.title.toLowerCase().includes(titleFilter.toLowerCase())) {
        continue;
      }
      row++;
      console.log([row, proj.number, proj.id, proj.title].join("\t"));
    }

    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after !== null);

  if (row === 0 && titleFilter) {
    console.log(`No projects found matching "${titleFilter}"`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
