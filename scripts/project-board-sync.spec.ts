import {
  decideActions,
  gql,
  resolveProjectMeta,
  removeLabel,
  assignIfUnassigned,
  closeIssue,
} from "./project-board-sync";

describe("decideActions", () => {
  it("issue opened → ensure on board, set Backlog", () => {
    expect(
      decideActions({ eventName: "issues", action: "opened", issueNumber: 5 }),
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
      decideActions({
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
      decideActions({
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

  it("issue closed as completed → ensure on board, set Done", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "closed",
        issueNumber: 5,
        stateReason: "completed",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
        ],
      },
    ]);
  });

  it("issue closed as not planned → ensure on board, set Closed", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "closed",
        issueNumber: 5,
        stateReason: "not_planned",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Closed" },
        ],
      },
    ]);
  });

  it("issue closed as duplicate → ensure on board, set Closed", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "closed",
        issueNumber: 5,
        stateReason: "duplicate",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Closed" },
        ],
      },
    ]);
  });

  it("issue closed with no state reason → ensure on board, set Closed", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "closed",
        issueNumber: 5,
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Closed" },
        ],
      },
    ]);
  });

  it("an unrelated label → no actions", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "bug",
      }),
    ).toEqual([]);
  });

  it("PR opened with closing refs → In review for each linked issue", () => {
    expect(
      decideActions({
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
      decideActions({
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
      decideActions({
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
      decideActions({
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

  it("PR merged with an author → assign before close", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "sandbox",
        merged: true,
        linkedIssues: [5],
        prAuthor: "octocat",
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "assignIfUnassigned", login: "octocat" },
          { type: "closeIssue" },
        ],
      },
    ]);
  });

  it("PR closed without merge → no actions", () => {
    expect(
      decideActions({
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
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "main",
        merged: true,
        linkedIssues: [9],
      }),
    ).toEqual([]);
  });

  it("PR reopened with closing refs → In review for each linked issue", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "reopened",
        baseRef: "sandbox",
        merged: false,
        linkedIssues: [5],
      }),
    ).toEqual([
      {
        issue: 5,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In review" },
        ],
      },
    ]);
  });

  it("PR marked ready_for_review with closing refs → In review", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "ready_for_review",
        baseRef: "sandbox",
        merged: false,
        linkedIssues: [7],
      }),
    ).toEqual([
      {
        issue: 7,
        actions: [
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "In review" },
        ],
      },
    ]);
  });
});

describe("gql", () => {
  const token = "t0ken";

  it("posts the query with the bearer token and returns data", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
      );
    const data = await gql<{ ok: boolean }>(
      "query{}",
      { a: 1 },
      token,
      fetchMock as unknown as typeof fetch,
    );
    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer t0ken",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      query: "query{}",
      variables: { a: 1 },
    });
  });

  it("throws when the GraphQL response carries errors", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "boom" }] }), {
        status: 200,
      }),
    );
    await expect(
      gql("query{}", {}, token, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow("boom");
  });
});

describe("resolveProjectMeta", () => {
  it("throws when a Status option is missing from the board", async () => {
    const body = {
      data: {
        organization: {
          projectV2: {
            id: "P",
            field: {
              id: "F",
              options: [
                { id: "1", name: "Backlog" },
                { id: "2", name: "Ready" },
                { id: "3", name: "In progress" },
                { id: "4", name: "In review" },
                // "Done" intentionally missing
              ],
            },
          },
        },
      },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(
      resolveProjectMeta("tok", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('Status option not found on board: "Done"');
  });
});

describe("removeLabel", () => {
  it("swallows a 404 when the label is already absent", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      removeLabel(
        "o",
        "r",
        5,
        "progressing",
        "tok",
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws on a non-404 error status", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      removeLabel(
        "o",
        "r",
        5,
        "progressing",
        "tok",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow("HTTP 500");
  });
});

describe("assignIfUnassigned", () => {
  it("assigns when the issue has no assignees", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ assignees: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    await assignIfUnassigned(
      "o",
      "r",
      5,
      "octocat",
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.github.com/repos/o/r/issues/5/assignees");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      assignees: ["octocat"],
    });
  });

  it("does nothing when the issue already has an assignee", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ assignees: [{ login: "someone" }] }), {
        status: 200,
      }),
    );
    await assignIfUnassigned(
      "o",
      "r",
      5,
      "octocat",
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the assignment fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ assignees: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 422 }));
    await expect(
      assignIfUnassigned(
        "o",
        "r",
        5,
        "octocat",
        "tok",
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow("HTTP 422");
  });
});

describe("closeIssue", () => {
  it("closes the issue explicitly as completed", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await closeIssue("o", "r", 5, "tok", fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/o/r/issues/5");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      state: "closed",
      state_reason: "completed",
    });
  });

  it("throws on a non-ok status", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      closeIssue("o", "r", 5, "tok", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow("HTTP 500");
  });
});
