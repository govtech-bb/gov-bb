# Alpha² Board Label Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the Alpha² project board (#7) automatically from issue labels and PR activity via a single GitHub Actions workflow in `gov-bb`.

**Architecture:** One workflow (`.github/workflows/project-automation.yml`) mints an org-owned GitHub App token and runs `scripts/project-board-sync.ts` (tsx). The script splits a **pure** `decideActions()` (event → ordered intents, unit-tested) from an impure `apply()` that talks to GitHub's GraphQL + REST APIs with raw `fetch` (same zero-dependency style as `scripts/archive-merged-drafts.ts`). GitHub's built-in Projects workflows are reduced to board *membership* only.

**Tech Stack:** GitHub Actions, `actions/create-github-app-token@v2`, TypeScript via `tsx`, `fetch` against GitHub GraphQL/REST, jest (ts-jest) for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-29-board-label-automation-design.md`

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `scripts/project-board-sync.ts` | Pure `decideActions()` + impure `apply()`/`main()` + fetch helpers | Create |
| `scripts/project-board-sync.spec.ts` | jest unit tests for `decideActions()` and one apply helper | Create |
| `.github/workflows/project-automation.yml` | Triggers, App-token mint, runs the script | Create |

Ops tasks (no code): create labels, create+install the App, add secrets, disable five built-in Projects workflows, end-to-end smoke test.

**Test command (not in CI's `nx run-many -t test`):**
`npx jest --config scripts/jest.config.ts`

---

## Task 1: Create the `ready` and `progressing` labels

**Files:** none (GitHub state).

- [ ] **Step 1: Create both labels in `gov-bb`**

```bash
gh label create ready       -R govtech-bb/gov-bb --color 0E8A16 --description "Refined and ready to be picked up" --force
gh label create progressing -R govtech-bb/gov-bb --color FBCA04 --description "Actively being worked on"          --force
```

- [ ] **Step 2: Verify**

Run: `gh label list -R govtech-bb/gov-bb | grep -E 'ready|progressing'`
Expected: both labels listed with the colours above.

---

## Task 2: Create and install the GitHub App

**Files:** none (GitHub state). This is a one-time manual setup via the GitHub UI.

- [ ] **Step 1: Create the App**

Go to `https://github.com/organizations/govtech-bb/settings/apps/new` and set:
- **Name:** `Alpha² Board Automation`
- **Homepage URL:** the repo URL (any valid URL).
- **Webhook:** uncheck **Active** (we don't receive webhooks; Actions polls events).
- **Permissions:**
  - Organization → **Projects: Read and write**
  - Repository → **Issues: Read and write**
  - Repository → **Pull requests: Read-only**
- **Where can this app be installed:** Only on this account.

Click **Create GitHub App**.

- [ ] **Step 2: Generate a private key**

On the App's page → **Private keys** → **Generate a private key**. A `.pem` downloads. Keep it for Task 3.

- [ ] **Step 3: Install the App on `gov-bb`**

App page → **Install App** → install on `govtech-bb`, scoped to **Only select repositories → `gov-bb`**.

- [ ] **Step 4: Note the App ID**

App page → **About** → copy the numeric **App ID**.

---

## Task 3: Add repo secrets

**Files:** none (GitHub state).

- [ ] **Step 1: Add the App ID and private key as repo secrets**

```bash
gh secret set BOARD_BOT_APP_ID -R govtech-bb/gov-bb --body "<APP_ID_FROM_TASK_2>"
gh secret set BOARD_BOT_PRIVATE_KEY -R govtech-bb/gov-bb < /path/to/downloaded-private-key.pem
```

- [ ] **Step 2: Verify**

Run: `gh secret list -R govtech-bb/gov-bb | grep BOARD_BOT`
Expected: `BOARD_BOT_APP_ID` and `BOARD_BOT_PRIVATE_KEY` listed.

---

## Task 4: `decideActions()` — the pure decision logic (TDD)

**Files:**
- Create: `scripts/project-board-sync.ts`
- Test: `scripts/project-board-sync.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/project-board-sync.spec.ts`:

```ts
import { decideActions, type SyncInput, type IssuePlan } from "./project-board-sync";

const plan = (input: SyncInput): IssuePlan[] => decideActions(input);

describe("decideActions", () => {
  it("issue opened → ensure on board, set Backlog", () => {
    expect(plan({ eventName: "issues", action: "opened", issueNumber: 5 })).toEqual([
      { issue: 5, actions: [{ type: "ensureOnBoard" }, { type: "setStatus", status: "Backlog" }] },
    ]);
  });

  it("label 'ready' → strip progressing, set Ready", () => {
    expect(plan({ eventName: "issues", action: "labeled", issueNumber: 5, labelName: "ready" })).toEqual([
      { issue: 5, actions: [
        { type: "removeLabel", label: "progressing" },
        { type: "ensureOnBoard" },
        { type: "setStatus", status: "Ready" },
      ] },
    ]);
  });

  it("label 'progressing' → strip ready, set In progress", () => {
    expect(plan({ eventName: "issues", action: "labeled", issueNumber: 5, labelName: "progressing" })).toEqual([
      { issue: 5, actions: [
        { type: "removeLabel", label: "ready" },
        { type: "ensureOnBoard" },
        { type: "setStatus", status: "In progress" },
      ] },
    ]);
  });

  it("an unrelated label → no actions", () => {
    expect(plan({ eventName: "issues", action: "labeled", issueNumber: 5, labelName: "bug" })).toEqual([]);
  });

  it("PR opened with closing refs → In review for each linked issue", () => {
    expect(plan({ eventName: "pull_request", action: "opened", baseRef: "sandbox", merged: false, linkedIssues: [5, 7] })).toEqual([
      { issue: 5, actions: [{ type: "ensureOnBoard" }, { type: "setStatus", status: "In review" }] },
      { issue: 7, actions: [{ type: "ensureOnBoard" }, { type: "setStatus", status: "In review" }] },
    ]);
  });

  it("PR opened with no closing refs → no actions", () => {
    expect(plan({ eventName: "pull_request", action: "opened", baseRef: "sandbox", merged: false, linkedIssues: [] })).toEqual([]);
  });

  it("PR merged into sandbox → Done, remove progressing, close", () => {
    expect(plan({ eventName: "pull_request", action: "closed", baseRef: "sandbox", merged: true, linkedIssues: [5] })).toEqual([
      { issue: 5, actions: [
        { type: "ensureOnBoard" },
        { type: "setStatus", status: "Done" },
        { type: "removeLabel", label: "progressing" },
        { type: "closeIssue" },
      ] },
    ]);
  });

  it("PR merged into dev → Done, remove progressing, close", () => {
    expect(plan({ eventName: "pull_request", action: "closed", baseRef: "dev", merged: true, linkedIssues: [9] })).toEqual([
      { issue: 9, actions: [
        { type: "ensureOnBoard" },
        { type: "setStatus", status: "Done" },
        { type: "removeLabel", label: "progressing" },
        { type: "closeIssue" },
      ] },
    ]);
  });

  it("PR closed without merge → no actions", () => {
    expect(plan({ eventName: "pull_request", action: "closed", baseRef: "dev", merged: false, linkedIssues: [9] })).toEqual([]);
  });

  it("PR merged into a non-target base (main) → no actions", () => {
    expect(plan({ eventName: "pull_request", action: "closed", baseRef: "main", merged: true, linkedIssues: [9] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config scripts/jest.config.ts project-board-sync`
Expected: FAIL — `Cannot find module './project-board-sync'`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/project-board-sync.ts` with the types and pure function only:

```ts
// Board automation for the Alpha² project (#7). See
// docs/superpowers/specs/2026-05-29-board-label-automation-design.md
export type Status = "Backlog" | "Ready" | "In progress" | "In review" | "Done";
export type ExclusiveLabel = "ready" | "progressing";

export type Action =
  | { type: "ensureOnBoard" }
  | { type: "setStatus"; status: Status }
  | { type: "removeLabel"; label: ExclusiveLabel }
  | { type: "closeIssue" };

export interface IssuePlan {
  issue: number;
  actions: Action[];
}

export interface SyncInput {
  eventName: "issues" | "pull_request";
  action: string;
  // issues.*
  issueNumber?: number;
  labelName?: string;
  // pull_request.*
  merged?: boolean;
  baseRef?: string;
  linkedIssues?: number[]; // closing-keyword references, pre-fetched
}

const MERGE_TARGETS = new Set(["sandbox", "dev"]);

/** Pure: maps a normalized event to an ordered per-issue action plan. */
export function decideActions(input: SyncInput): IssuePlan[] {
  if (input.eventName === "issues") {
    const issue = input.issueNumber!;
    if (input.action === "opened") {
      return [{ issue, actions: [{ type: "ensureOnBoard" }, { type: "setStatus", status: "Backlog" }] }];
    }
    if (input.action === "labeled") {
      if (input.labelName === "ready") {
        return [{ issue, actions: [
          { type: "removeLabel", label: "progressing" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Ready" },
        ] }];
      }
      if (input.labelName === "progressing") {
        return [{ issue, actions: [
          { type: "removeLabel", label: "ready" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In progress" },
        ] }];
      }
    }
    return [];
  }

  // pull_request
  const linked = input.linkedIssues ?? [];
  if (linked.length === 0) return [];

  if (["opened", "reopened", "ready_for_review"].includes(input.action)) {
    return linked.map((issue) => ({
      issue,
      actions: [{ type: "ensureOnBoard" }, { type: "setStatus", status: "In review" }],
    }));
  }

  if (input.action === "closed" && input.merged && MERGE_TARGETS.has(input.baseRef ?? "")) {
    return linked.map((issue) => ({
      issue,
      actions: [
        { type: "ensureOnBoard" },
        { type: "setStatus", status: "Done" },
        { type: "removeLabel", label: "progressing" },
        { type: "closeIssue" },
      ],
    }));
  }

  return [];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config scripts/jest.config.ts project-board-sync`
Expected: PASS — 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/project-board-sync.ts scripts/project-board-sync.spec.ts
git commit -m "feat: pure decideActions for Alpha² board automation"
```

---

## Task 5: Fetch helpers, `apply()`, and `main()` (impure)

**Files:**
- Modify: `scripts/project-board-sync.ts`
- Test: `scripts/project-board-sync.spec.ts`

- [ ] **Step 1: Write the failing test for `gql()` error handling**

Append to `scripts/project-board-sync.spec.ts`:

```ts
import { gql } from "./project-board-sync";

describe("gql", () => {
  const token = "t0ken";

  it("posts the query with the bearer token and returns data", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    );
    const data = await gql<{ ok: boolean }>("query{}", { a: 1 }, token, fetchMock as unknown as typeof fetch);
    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(JSON.parse(init.body as string)).toEqual({ query: "query{}", variables: { a: 1 } });
  });

  it("throws when the GraphQL response carries errors", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 }),
    );
    await expect(gql("query{}", {}, token, fetchMock as unknown as typeof fetch)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config scripts/jest.config.ts project-board-sync`
Expected: FAIL — `gql is not a function` / not exported.

- [ ] **Step 3: Implement the helpers, `apply()`, and `main()`**

Append to `scripts/project-board-sync.ts`:

```ts
import { readFileSync } from "node:fs";

const API = "https://api.github.com";
const PROJECT_OWNER = "govtech-bb";
const PROJECT_NUMBER = 7;

type FetchFn = typeof fetch;

/** Minimal GraphQL client over fetch. Throws on transport or GraphQL errors. */
export async function gql<T>(query: string, variables: Record<string, unknown>, token: string, f: FetchFn = fetch): Promise<T> {
  const res = await f(`${API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "alpha2-board-bot",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!res.ok || !json.data) throw new Error(`GraphQL HTTP ${res.status}`);
  return json.data;
}

interface ProjectMeta {
  projectId: string;
  statusFieldId: string;
  optionIds: Record<Status, string>;
}

async function resolveProjectMeta(token: string): Promise<ProjectMeta> {
  const data = await gql<{
    organization: { projectV2: { id: string; field: { id: string; options: { id: string; name: string }[] } } };
  }>(
    `query($org:String!,$num:Int!){
      organization(login:$org){ projectV2(number:$num){
        id
        field(name:"Status"){ ... on ProjectV2SingleSelectField { id options { id name } } }
      } }
    }`,
    { org: PROJECT_OWNER, num: PROJECT_NUMBER },
    token,
  );
  const field = data.organization.projectV2.field;
  const byName = (name: Status): string => {
    const opt = field.options.find((o) => o.name === name);
    if (!opt) throw new Error(`Status option not found on board: "${name}"`);
    return opt.id;
  };
  return {
    projectId: data.organization.projectV2.id,
    statusFieldId: field.id,
    optionIds: { Backlog: byName("Backlog"), Ready: byName("Ready"), "In progress": byName("In progress"), "In review": byName("In review"), Done: byName("Done") },
  };
}

/** Returns the issue node id and its project item id (adding it to the board if missing). */
async function ensureItem(owner: string, repo: string, issue: number, meta: ProjectMeta, token: string): Promise<string> {
  const data = await gql<{
    repository: { issue: { id: string; projectItems: { nodes: { id: string; project: { id: string } }[] } } };
  }>(
    `query($owner:String!,$repo:String!,$num:Int!){
      repository(owner:$owner,name:$repo){ issue(number:$num){
        id projectItems(first:50){ nodes { id project { id } } }
      } }
    }`,
    { owner, repo, num: issue },
    token,
  );
  const existing = data.repository.issue.projectItems.nodes.find((n) => n.project.id === meta.projectId);
  if (existing) return existing.id;
  const added = await gql<{ addProjectV2ItemById: { item: { id: string } } }>(
    `mutation($project:ID!,$content:ID!){ addProjectV2ItemById(input:{projectId:$project,contentId:$content}){ item { id } } }`,
    { project: meta.projectId, content: data.repository.issue.id },
    token,
  );
  return added.addProjectV2ItemById.item.id;
}

async function setStatus(itemId: string, status: Status, meta: ProjectMeta, token: string): Promise<void> {
  await gql(
    `mutation($project:ID!,$item:ID!,$field:ID!,$opt:String!){
      updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$opt}}){ projectV2Item { id } }
    }`,
    { project: meta.projectId, item: itemId, field: meta.statusFieldId, opt: meta.optionIds[status] },
    token,
  );
}

async function rest(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "alpha2-board-bot",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function removeLabel(owner: string, repo: string, issue: number, label: ExclusiveLabel, token: string): Promise<void> {
  const res = await rest("DELETE", `/repos/${owner}/${repo}/issues/${issue}/labels/${label}`, token);
  if (!res.ok && res.status !== 404) throw new Error(`removeLabel ${label} on #${issue}: HTTP ${res.status}`);
}

async function closeIssue(owner: string, repo: string, issue: number, token: string): Promise<void> {
  const res = await rest("PATCH", `/repos/${owner}/${repo}/issues/${issue}`, token, { state: "closed" });
  if (!res.ok) throw new Error(`closeIssue #${issue}: HTTP ${res.status}`);
}

/** Executes a per-issue plan in order. */
async function apply(owner: string, repo: string, plans: IssuePlan[], token: string): Promise<void> {
  const meta = await resolveProjectMeta(token);
  for (const plan of plans) {
    let itemId: string | undefined;
    for (const action of plan.actions) {
      switch (action.type) {
        case "ensureOnBoard":
          itemId = await ensureItem(owner, repo, plan.issue, meta, token);
          break;
        case "setStatus":
          if (!itemId) itemId = await ensureItem(owner, repo, plan.issue, meta, token);
          await setStatus(itemId, action.status, meta, token);
          break;
        case "removeLabel":
          await removeLabel(owner, repo, plan.issue, action.label, token);
          break;
        case "closeIssue":
          await closeIssue(owner, repo, plan.issue, token);
          break;
      }
    }
    console.log(`#${plan.issue}: ${plan.actions.map((a) => a.type).join(", ")}`);
  }
}

/** Reads the closing-keyword issue references for a PR. */
async function closingIssues(owner: string, repo: string, pr: number, token: string): Promise<number[]> {
  const data = await gql<{ repository: { pullRequest: { closingIssuesReferences: { nodes: { number: number }[] } } } }>(
    `query($owner:String!,$repo:String!,$num:Int!){
      repository(owner:$owner,name:$repo){ pullRequest(number:$num){ closingIssuesReferences(first:50){ nodes { number } } } }
    }`,
    { owner, repo, num: pr },
    token,
  );
  return data.repository.pullRequest.closingIssuesReferences.nodes.map((n) => n.number);
}

async function main(): Promise<void> {
  const eventName = process.env.GITHUB_EVENT_NAME as SyncInput["eventName"];
  const token = process.env.GITHUB_TOKEN!;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");
  const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));

  let input: SyncInput;
  if (eventName === "issues") {
    input = { eventName, action: payload.action, issueNumber: payload.issue.number, labelName: payload.label?.name };
  } else {
    const pr = payload.pull_request;
    const linkedIssues = await closingIssues(owner, repo, pr.number, token);
    input = { eventName, action: payload.action, merged: pr.merged, baseRef: pr.base.ref, linkedIssues };
  }

  const plans = decideActions(input);
  if (plans.length === 0) {
    console.log(`No board actions for ${eventName}.${input.action}`);
    return;
  }
  await apply(owner, repo, plans, token);
}

// Only run when executed directly (not when imported by tests).
if (process.env.GITHUB_EVENT_NAME) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config scripts/jest.config.ts project-board-sync`
Expected: PASS — `decideActions` (10) + `gql` (2) all green. Note: the `scripts/jest.config.ts` preset is `ts-jest` (not isolatedModules), so this run also **type-checks** `project-board-sync.ts` — a type error fails the suite. No separate `tsc` step is needed.

- [ ] **Step 5: Commit**

```bash
git add scripts/project-board-sync.ts scripts/project-board-sync.spec.ts
git commit -m "feat: fetch-based apply/main for Alpha² board automation"
```

---

## Task 6: The GitHub Actions workflow

**Files:**
- Create: `.github/workflows/project-automation.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Project board automation

on:
  issues:
    types: [opened, labeled]
  pull_request:
    types: [opened, reopened, ready_for_review, closed]

permissions:
  contents: read

# Serialise events for the same item so rapid label toggles don't race.
concurrency:
  group: proj-sync-${{ github.event.issue.number || github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  sync:
    name: Sync issue to Alpha² board
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Mint GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.BOARD_BOT_APP_ID }}
          private-key: ${{ secrets.BOARD_BOT_PRIVATE_KEY }}
          # Org-scoped token so org-level Projects v2 writes are permitted.
          owner: ${{ github.repository_owner }}

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile

      - name: Sync board
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
        run: pnpm tsx scripts/project-board-sync.ts
```

- [ ] **Step 2: Lint the workflow YAML**

Run: `npx --yes action-validator .github/workflows/project-automation.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/project-automation.yml')); print('yaml ok')"`
Expected: `yaml ok` (or action-validator passing). Fix any parse error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/project-automation.yml
git commit -m "ci: add Alpha² project board automation workflow"
```

---

## Task 7: Disable the conflicting built-in Projects workflows

**Files:** none (board settings).

- [ ] **Step 1: Disable the five status-mutating built-ins**

In the board UI (`https://github.com/orgs/govtech-bb/projects/7/workflows`), toggle **off**:
- #12 Item added to project
- #7 Item closed
- #8 Pull request merged
- #11 Pull request linked to issue
- #9 Auto-close issue

Leave **on** (membership only): #13 Auto-add to project, #14 Auto-add bug to project, #10 Auto-add sub-issues to project.

- [ ] **Step 2: Verify via API**

Run:
```bash
gh api graphql -f query='query{organization(login:"govtech-bb"){projectV2(number:7){workflows(first:50){nodes{number name enabled}}}}}' \
  | python3 -c "import json,sys; [print(n['number'],n['enabled'],n['name']) for n in json.load(sys.stdin)['data']['organization']['projectV2']['workflows']['nodes']]"
```
Expected: #7, #8, #9, #11, #12 show `False`; #10, #13, #14 show `True`.

---

## Task 8: End-to-end smoke test

**Files:** none.

- [ ] **Step 1: Open the PR for the automation branch and merge to land the workflow**

Merge `feat/board-label-automation` into `sandbox` (the workflow only takes effect once on the target branch).

- [ ] **Step 2: Walk an issue through every transition**

Create a throwaway issue, then watch the board (and the Actions tab) after each action:

1. Create issue → lands in **Backlog**.
2. Add label `ready` → moves to **Ready**.
3. Add label `progressing` → moves to **In progress**, and `ready` is removed.
4. Open a PR whose body contains `Closes #<issue>` against `sandbox` → issue moves to **In review**.
5. Merge that PR into `sandbox` → issue moves to **Done**, `progressing` is removed, and the issue is **closed**.

- [ ] **Step 2 checkpoint:** If any step fails, open the failed run in the Actions tab; a `403` on a Projects write means the App lacks **Org → Projects: Read and write** or the token isn't org-scoped (see Task 6 `owner:`).

- [ ] **Step 3: Clean up**

Delete the throwaway issue/PR.

---

## CI / coverage note

`scripts/*.spec.ts` are **not** part of `nx run-many -t test` (CI's test job), mirroring the existing `archive-merged-drafts.spec.ts`. Run them explicitly with `npx jest --config scripts/jest.config.ts` before pushing. The workflow itself only executes on real GitHub events, so Task 8 is the true integration gate.
