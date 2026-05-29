import {
  decideActions,
  type SyncInput,
  type IssuePlan,
} from "./project-board-sync";

const plan = (input: SyncInput): IssuePlan[] => decideActions(input);

describe("decideActions", () => {
  it("issue opened → ensure on board, set Backlog", () => {
    expect(
      plan({ eventName: "issues", action: "opened", issueNumber: 5 }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Backlog" },
        ],
      },
    ]);
  });

  it("label 'ready' → strip progressing, set Ready", () => {
    expect(
      plan({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "ready",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "removeLabel", label: "progressing" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Ready" },
        ],
      },
    ]);
  });

  it("label 'progressing' → strip ready, set In progress", () => {
    expect(
      plan({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "progressing",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "removeLabel", label: "ready" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In progress" },
        ],
      },
    ]);
  });

  it("an unrelated label → no actions", () => {
    expect(
      plan({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "bug",
      }),
    ).toEqual([]);
  });

  it("PR opened with closing refs → In review for each linked issue", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "opened",
        baseRef: "sandbox",
        merged: false,
        linkedIssues: [5, 7],
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In review" },
        ],
      },
      {
        issue: 7,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In review" },
        ],
      },
    ]);
  });

  it("PR opened with no closing refs → no actions", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "opened",
        baseRef: "sandbox",
        merged: false,
        linkedIssues: [],
      }),
    ).toEqual([]);
  });

  it("PR merged into sandbox → Done, remove progressing, close", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "closed",
        baseRef: "sandbox",
        merged: true,
        linkedIssues: [5],
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "closeIssue" },
        ],
      },
    ]);
  });

  it("PR merged into dev → Done, remove progressing, close", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "closed",
        baseRef: "dev",
        merged: true,
        linkedIssues: [9],
      }),
    ).toEqual([
      {
        issue: 9,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "closeIssue" },
        ],
      },
    ]);
  });

  it("PR closed without merge → no actions", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "closed",
        baseRef: "dev",
        merged: false,
        linkedIssues: [9],
      }),
    ).toEqual([]);
  });

  it("PR merged into a non-target base (main) → no actions", () => {
    expect(
      plan({
        eventName: "pull_request",
        action: "closed",
        baseRef: "main",
        merged: true,
        linkedIssues: [9],
      }),
    ).toEqual([]);
  });
});
