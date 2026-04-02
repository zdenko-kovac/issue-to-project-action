# issue-to-project-action

A GitHub Action that automatically adds newly opened issues to a GitHub ProjectV2 board.

No server to deploy or maintain — runs on GitHub Actions runners whenever an issue is opened.

## Usage

### Per-repository

Create `.github/workflows/issue-to-project.yml` in your repo:

```yaml
name: Add issue to project

on:
  issues:
    types: [opened]

jobs:
  add-to-project:
    runs-on: ubuntu-latest
    steps:
      - uses: <owner>/issue-to-project-action@v1
        with:
          project-node-id: "PVT_kwDOAbc123"
          github-token: ${{ secrets.PROJECT_TOKEN }}
```

### Org-wide (all repos)

Create this same workflow file in your org's `.github` repository at `.github/workflows/issue-to-project.yml`. GitHub automatically applies it to every repo in the org.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project-node-id` | yes | ProjectV2 node ID (e.g. `PVT_kwDOAbc123`) |
| `github-token` | yes | A token with **project write** scope (see below) |

## Outputs

| Output | Description |
|---|---|
| `item-id` | The node ID of the created project item |

## Token permissions

The default `GITHUB_TOKEN` does **not** have ProjectV2 permissions. You need one of:

1. **Fine-grained PAT** with `Organization projects: Read and write` permission
2. **Classic PAT** with `project` scope

Store it as a repository or organization secret (e.g. `PROJECT_TOKEN`) and reference it in the workflow.

## Finding your Project Node ID

Clone this repo and run the included helper scripts with a PAT that has `read:org` and `project` scopes:

```sh
npm install
GITHUB_TOKEN=<pat> GITHUB_ORG=<your-org> npm run list-projects
```

Filter by title:
```sh
GITHUB_TOKEN=<pat> GITHUB_ORG=<your-org> npm run list-projects -- "My Board"
```

Inspect status fields and option IDs for a specific project:
```sh
GITHUB_TOKEN=<pat> GITHUB_ORG=<your-org> npm run list-project-statuses -- PVT_kwDOA...
```

## How it works

1. The workflow triggers on `issues.opened`
2. The action reads the issue's `node_id` from the event payload
3. Calls the `addProjectV2ItemById` GraphQL mutation to add it to your project
4. Retries transient failures (network errors, timeouts) up to 3 times with exponential backoff
5. Auth and permission errors fail immediately

The mutation is idempotent — adding an issue that's already in the project is a no-op.

## Development

```sh
npm install
npm run typecheck    # type-check without emitting
npm run build        # bundle to dist/index.js via ncc
```

The `dist/` directory must be committed — GitHub runs `dist/index.js` directly.
