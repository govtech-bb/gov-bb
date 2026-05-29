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

export type SyncInput =
  | {
      eventName: "issues";
      action: string;
      issueNumber: number;
      labelName?: string;
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
