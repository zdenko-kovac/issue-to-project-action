import { graphql } from "@octokit/graphql";

const LIST_PROJECTS_QUERY = `
  query($org: String!, $after: String) {
    organization(login: $org) {
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

interface QueryResult {
  organization: {
    projectsV2: {
      nodes: ProjectNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

async function main(): Promise<void> {
  const titleFilter = process.argv[2];

  const required = ["GITHUB_TOKEN", "GITHUB_ORG"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const client = graphql.defaults({
    headers: { authorization: `token ${process.env.GITHUB_TOKEN}` },
  });

  if (titleFilter) {
    console.log(`Projects matching "${titleFilter}" in org: ${process.env.GITHUB_ORG}\n`);
  } else {
    console.log(`Projects in org: ${process.env.GITHUB_ORG}\n`);
  }

  console.log(["#", "Number", "Node ID", "Title"].join("\t"));
  console.log("-".repeat(80));

  let after: string | null = null;
  let row = 0;

  do {
    const result: QueryResult = await client(LIST_PROJECTS_QUERY, {
      org: process.env.GITHUB_ORG,
      after: after ?? undefined,
    });

    const { nodes, pageInfo } = result.organization.projectsV2;

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
