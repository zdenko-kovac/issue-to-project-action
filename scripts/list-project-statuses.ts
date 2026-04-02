import { graphql } from "@octokit/graphql";

const LIST_PROJECTS_QUERY = `
  query($org: String!, $after: String) {
    organization(login: $org) {
      projectsV2(first: 20, after: $after) {
        nodes {
          id
          title
          number
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const GET_PROJECT_QUERY = `
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        id
        title
        number
        fields(first: 50) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

interface FieldOption {
  id: string;
  name: string;
}

interface SingleSelectField {
  id: string;
  name: string;
  options: FieldOption[];
}

interface ProjectNode {
  id: string;
  title: string;
  number: number;
  fields: {
    nodes: (SingleSelectField | Record<string, never>)[];
  };
}

interface QueryResult {
  organization: {
    projectsV2: {
      nodes: ProjectNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

interface SingleProjectResult {
  node: ProjectNode | null;
}

function isSingleSelectField(
  node: SingleSelectField | Record<string, never>,
): node is SingleSelectField {
  return "options" in node && Array.isArray(node.options);
}

function printProject(proj: ProjectNode): void {
  console.log("=".repeat(80));
  console.log(`Project #${proj.number}: ${proj.title}`);
  console.log(`  Node ID: ${proj.id}`);

  const singleSelectFields = proj.fields.nodes.filter(isSingleSelectField);

  if (singleSelectFields.length === 0) {
    console.log("  (no single-select fields found)");
    return;
  }

  for (const field of singleSelectFields) {
    console.log(`\n  Field: "${field.name}"  (Field ID: ${field.id})`);
    console.log(`  ${"Option Name".padEnd(30)}Option ID`);
    console.log(`  ${"-".repeat(30)}${"-".repeat(50)}`);
    for (const opt of field.options) {
      console.log(`  ${opt.name.padEnd(30)}${opt.id}`);
    }
  }
}

async function main(): Promise<void> {
  const projectId = process.argv[2];

  const required = projectId ? ["GITHUB_TOKEN"] : ["GITHUB_TOKEN", "GITHUB_ORG"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const client = graphql.defaults({
    headers: { authorization: `token ${process.env.GITHUB_TOKEN}` },
  });

  if (projectId) {
    console.log(`Statuses for project: ${projectId}\n`);

    const result: SingleProjectResult = await client(GET_PROJECT_QUERY, {
      projectId,
    });

    const proj = result.node;
    if (!proj) {
      console.error(`Project not found: ${projectId}`);
      process.exit(1);
      return;
    }

    printProject(proj);
  } else {
    console.log(`Projects and statuses in org: ${process.env.GITHUB_ORG}\n`);

    let after: string | null = null;

    do {
      const result: QueryResult = await client(LIST_PROJECTS_QUERY, {
        org: process.env.GITHUB_ORG,
        after: after ?? undefined,
      });

      const { nodes, pageInfo } = result.organization.projectsV2;

      for (const proj of nodes) {
        printProject(proj);
      }

      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after !== null);
  }

  console.log("\n" + "=".repeat(80));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
