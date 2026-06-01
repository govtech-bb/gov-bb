// Board automation for the Alpha² project (#7). See
// docs/superpowers/specs/2026-05-29-board-label-automation-design.md
import { readFileSync } from "node:fs";

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

export type SyncInput =
  | {
      eventName: "issues";
      action: string;
      issueNumber: number;
      labelName?: string;
      // Reason an issue was closed: "completed" or "not_planned". Only present
      // on `closed` events.
      stateReason?: string;
    }
  | {
      eventName: "pull_request";
      action: string;
      merged?: boolean;
      baseRef?: string;
      linkedIssues?: number[];
    };

const MERGE_TARGETS = new Set(["sandbox", "dev"]);

/** Pure: maps a normalized event to an ordered per-issue action plan. */
export function decideActions(input: SyncInput): IssuePlan[] {
  if (input.eventName === "issues") {
    const issue = input.issueNumber;
    if (input.action === "opened") {
      return [
        {
          issue,
          actions: [
            { type: "ensureOnBoard" },
            { type: "setStatus", status: "Backlog" },
          ],
        },
      ];
    }
    if (input.action === "labeled") {
      if (input.labelName === "ready") {
        return [
          {
            issue,
            actions: [
              { type: "removeLabel", label: "progressing" },
              { type: "ensureOnBoard" },
              { type: "setStatus", status: "Ready" },
            ],
          },
        ];
      }
      if (input.labelName === "progressing") {
        return [
          {
            issue,
            actions: [
              { type: "removeLabel", label: "ready" },
              { type: "ensureOnBoard" },
              { type: "setStatus", status: "In progress" },
            ],
          },
        ];
      }
    }
    // Manually closing an issue as *completed* moves it to Done. A
    // "not planned" close (or a close with no reason) is left where it is.
    // Idempotent with the PR-merge path, which also closes + sets Done.
    if (input.action === "closed" && input.stateReason === "completed") {
      return [
        {
          issue,
          actions: [
            { type: "ensureOnBoard" },
            { type: "setStatus", status: "Done" },
          ],
        },
      ];
    }
    return [];
  }

  // pull_request
  const linked = input.linkedIssues ?? [];
  if (linked.length === 0) return [];

  if (["opened", "reopened", "ready_for_review"].includes(input.action)) {
    return linked.map(
      (issue): IssuePlan => ({
        issue,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In review" },
        ],
      }),
    );
  }

  if (
    input.action === "closed" &&
    input.merged &&
    MERGE_TARGETS.has(input.baseRef ?? "")
  ) {
    return linked.map(
      (issue): IssuePlan => ({
        issue,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "closeIssue" },
        ],
      }),
    );
  }

  return [];
}

const API = "https://api.github.com";
const PROJECT_OWNER = "govtech-bb";
const PROJECT_NUMBER = 7;

type FetchFn = typeof fetch;

/** Minimal GraphQL client over fetch. Throws on transport or GraphQL errors. */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  f: FetchFn = fetch,
): Promise<T> {
  const res = await f(`${API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "alpha2-board-bot",
    },
    body: JSON.stringify({ query, variables }),
  });
  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  } catch {
    throw new Error(`GraphQL HTTP ${res.status} (response body was not JSON)`);
  }
  if (json.errors?.length)
    throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!res.ok || !json.data) throw new Error(`GraphQL HTTP ${res.status}`);
  return json.data;
}

interface ProjectMeta {
  projectId: string;
  statusFieldId: string;
  optionIds: Record<Status, string>;
}

export async function resolveProjectMeta(
  token: string,
  f: FetchFn = fetch,
): Promise<ProjectMeta> {
  const data = await gql<{
    organization: {
      projectV2: {
        id: string;
        field: { id: string; options: { id: string; name: string }[] };
      };
    };
  }>(
    `query($org:String!,$num:Int!){
      organization(login:$org){ projectV2(number:$num){
        id
        field(name:"Status"){ ... on ProjectV2SingleSelectField { id options { id name } } }
      } }
    }`,
    { org: PROJECT_OWNER, num: PROJECT_NUMBER },
    token,
    f,
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
    optionIds: {
      Backlog: byName("Backlog"),
      Ready: byName("Ready"),
      "In progress": byName("In progress"),
      "In review": byName("In review"),
      Done: byName("Done"),
    },
  };
}

/** Returns the issue's project item id, adding it to the board if missing. */
async function ensureItem(
  owner: string,
  repo: string,
  issue: number,
  meta: ProjectMeta,
  token: string,
  f: FetchFn = fetch,
): Promise<string> {
  const data = await gql<{
    repository: {
      issue: {
        id: string;
        projectItems: { nodes: { id: string; project: { id: string } }[] };
      };
    };
  }>(
    `query($owner:String!,$repo:String!,$num:Int!){
      repository(owner:$owner,name:$repo){ issue(number:$num){
        id projectItems(first:50){ nodes { id project { id } } }
      } }
    }`,
    { owner, repo, num: issue },
    token,
    f,
  );
  const existing = data.repository.issue.projectItems.nodes.find(
    (n) => n.project.id === meta.projectId,
  );
  if (existing) return existing.id;
  const added = await gql<{ addProjectV2ItemById: { item: { id: string } } }>(
    `mutation($project:ID!,$content:ID!){ addProjectV2ItemById(input:{projectId:$project,contentId:$content}){ item { id } } }`,
    { project: meta.projectId, content: data.repository.issue.id },
    token,
    f,
  );
  return added.addProjectV2ItemById.item.id;
}

async function setStatus(
  itemId: string,
  status: Status,
  meta: ProjectMeta,
  token: string,
  f: FetchFn = fetch,
): Promise<void> {
  await gql(
    `mutation($project:ID!,$item:ID!,$field:ID!,$opt:String!){
      updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$opt}}){ projectV2Item { id } }
    }`,
    {
      project: meta.projectId,
      item: itemId,
      field: meta.statusFieldId,
      opt: meta.optionIds[status],
    },
    token,
    f,
  );
}

async function rest(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  f: FetchFn = fetch,
): Promise<Response> {
  return f(`${API}${path}`, {
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

export async function removeLabel(
  owner: string,
  repo: string,
  issue: number,
  label: ExclusiveLabel,
  token: string,
  f: FetchFn = fetch,
): Promise<void> {
  const res = await rest(
    "DELETE",
    `/repos/${owner}/${repo}/issues/${issue}/labels/${label}`,
    token,
    undefined,
    f,
  );
  if (!res.ok && res.status !== 404)
    throw new Error(`removeLabel ${label} on #${issue}: HTTP ${res.status}`);
}

async function closeIssue(
  owner: string,
  repo: string,
  issue: number,
  token: string,
  f: FetchFn = fetch,
): Promise<void> {
  const res = await rest(
    "PATCH",
    `/repos/${owner}/${repo}/issues/${issue}`,
    token,
    { state: "closed" },
    f,
  );
  if (!res.ok) throw new Error(`closeIssue #${issue}: HTTP ${res.status}`);
}

/** Executes a per-issue plan in order. */
async function apply(
  owner: string,
  repo: string,
  plans: IssuePlan[],
  token: string,
  f: FetchFn = fetch,
): Promise<void> {
  const meta = await resolveProjectMeta(token, f);
  for (const plan of plans) {
    let itemId: string | undefined;
    for (const action of plan.actions) {
      switch (action.type) {
        case "ensureOnBoard":
          itemId = await ensureItem(owner, repo, plan.issue, meta, token, f);
          break;
        case "setStatus":
          if (!itemId)
            itemId = await ensureItem(owner, repo, plan.issue, meta, token, f);
          await setStatus(itemId, action.status, meta, token, f);
          break;
        case "removeLabel":
          await removeLabel(owner, repo, plan.issue, action.label, token, f);
          break;
        case "closeIssue":
          await closeIssue(owner, repo, plan.issue, token, f);
          break;
      }
    }
    console.log(
      `#${plan.issue}: ${plan.actions.map((a) => a.type).join(", ")}`,
    );
  }
}

/** Reads the closing-keyword issue references for a PR. */
async function closingIssues(
  owner: string,
  repo: string,
  pr: number,
  token: string,
  f: FetchFn = fetch,
): Promise<number[]> {
  const data = await gql<{
    repository: {
      pullRequest: { closingIssuesReferences: { nodes: { number: number }[] } };
    };
  }>(
    `query($owner:String!,$repo:String!,$num:Int!){
      repository(owner:$owner,name:$repo){ pullRequest(number:$num){ closingIssuesReferences(first:50){ nodes { number } } } }
    }`,
    { owner, repo, num: pr },
    token,
    f,
  );
  return data.repository.pullRequest.closingIssuesReferences.nodes.map(
    (n) => n.number,
  );
}

async function main(): Promise<void> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repository || !eventPath || !eventName) {
    console.error(
      "Missing required env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, GITHUB_EVENT_NAME",
    );
    process.exit(1);
  }
  if (eventName !== "issues" && eventName !== "pull_request") {
    console.log(`Unhandled event "${eventName}"; skipping.`);
    return;
  }
  const [owner, repo] = repository.split("/");
  const payload = JSON.parse(readFileSync(eventPath, "utf8"));

  let input: SyncInput;
  if (eventName === "issues") {
    input = {
      eventName,
      action: payload.action,
      issueNumber: payload.issue.number,
      labelName: payload.label?.name,
      stateReason: payload.issue.state_reason,
    };
  } else {
    const pr = payload.pull_request;
    const linkedIssues = await closingIssues(owner, repo, pr.number, token);
    input = {
      eventName,
      action: payload.action,
      merged: pr.merged,
      baseRef: pr.base.ref,
      linkedIssues,
    };
  }

  const plans = decideActions(input);
  if (plans.length === 0) {
    console.log(`No board actions for ${eventName}.${input.action}`);
    return;
  }
  await apply(owner, repo, plans, token);
}

// Only execute under GitHub Actions (where GITHUB_EVENT_NAME is set);
// importing this module in tests must not trigger a run.
if (process.env.GITHUB_EVENT_NAME) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
