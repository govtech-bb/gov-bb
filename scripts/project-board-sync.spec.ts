import {
  decideActions,
  gql,
  resolveProjectMeta,
  removeLabel,
  assignIfUnassigned,
  closeIssue,
  isExcluded,
  removeFromBoard,
  parseClosingRefs,
  closingIssues,
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
        baseRef: "main",
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
        baseRef: "main",
        merged: false,
        linkedIssues: [],
      }),
    ).toEqual([]);
  });

  it("PR merged into main → Done, remove progressing, close", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "main",
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

  it("PR merged with an author → assign before close", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "main",
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
        baseRef: "main",
        merged: false,
        linkedIssues: [9],
      }),
    ).toEqual([]);
  });

  it("PR merged into a non-target base (sandbox) → no actions", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "sandbox",
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
        baseRef: "main",
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
        baseRef: "main",
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
    const fetchMock = vi
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
    const fetchMock = vi.fn().mockResolvedValue(
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(
      resolveProjectMeta("tok", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('Status option not found on board: "Done"');
  });

  it("queries project 28 for the v2 board and maps Closed to Done", async () => {
    const body = {
      data: {
        organization: {
          projectV2: {
            id: "P28",
            field: {
              id: "F",
              options: [
                { id: "1", name: "Backlog" },
                { id: "2", name: "Ready" },
                { id: "3", name: "In progress" },
                { id: "4", name: "In review" },
                { id: "5", name: "Done" },
              ],
            },
          },
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const meta = await resolveProjectMeta(
      "tok",
      fetchMock as unknown as typeof fetch,
      "v2",
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.variables.num).toBe(28);
    expect(meta.optionIds.Closed).toBe("5");
  });
});

describe("parseClosingRefs", () => {
  it("reads every closing keyword form, once per issue", () => {
    expect(
      parseClosingRefs(
        "Closes #1\nfixes: #2, Resolved #3 and closes #1\nFix #4",
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it("ignores bare and cross-repo references", () => {
    expect(
      parseClosingRefs("Covers #5. Closes govtech-bb/other#6. See #7"),
    ).toEqual([]);
  });
});

describe("closingIssues", () => {
  const ok = (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200 });
  const refs = (nodes: unknown[]) =>
    ok({ repository: { pullRequest: { closingIssuesReferences: { nodes } } } });

  it("adds body refs GitHub didn't link, skipping PRs and bad numbers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refs([]))
      .mockResolvedValueOnce(
        ok({
          repository: {
            issueOrPullRequest: {
              number: 5,
              title: "Fix it",
              labels: { nodes: [{ name: "v2-rewrite" }] },
            },
          },
        }),
      )
      .mockResolvedValueOnce(ok({ repository: { issueOrPullRequest: {} } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ errors: [{ message: "Could not resolve" }] }),
          { status: 200 },
        ),
      );
    const result = await closingIssues(
      "o",
      "r",
      1,
      "Closes #5\nCloses #6\nCloses #9999",
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ linkedIssues: [5], excludedIssues: [5] });
  });

  it("reads only GitHub's links when there is no body to parse", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        refs([{ number: 3, title: "Fix it", labels: { nodes: [] } }]),
      );
    const result = await closingIssues(
      "o",
      "r",
      1,
      undefined,
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ linkedIssues: [3], excludedIssues: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("removeLabel", () => {
  it("swallows a 404 when the label is already absent", async () => {
    const fetchMock = vi
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
    const fetchMock = vi
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
    const fetchMock = vi
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
    const fetchMock = vi.fn().mockResolvedValue(
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
    const fetchMock = vi
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
    const fetchMock = vi
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      closeIssue("o", "r", 5, "tok", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow("HTTP 500");
  });
});

describe("isExcluded", () => {
  it.each(["Merge v2-rewrite into main", "V2-Rewrite: editor", "v2 rewrite"])(
    "matches the title %j",
    (title) => {
      expect(isExcluded(title, [])).toBe(true);
    },
  );

  it("matches the v2-rewrite label", () => {
    expect(isExcluded("Fix it", ["bug", "v2-rewrite"])).toBe(true);
  });

  it("keeps any other issue", () => {
    expect(isExcluded("Fix it", ["bug"])).toBe(false);
  });
});

describe("decideActions for excluded issues", () => {
  it("opening an excluded issue puts it in Backlog on the v2 board", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "opened",
        issueNumber: 5,
        title: "Fix it",
        labels: ["v2-rewrite"],
      }),
    ).toEqual([
      {
        issue: 5,
        board: "v2",
        actions: [
          { type: "removeFromBoard" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Backlog" },
        ],
      },
    ]);
  });

  it("closing an excluded issue as not planned still asks for Closed", () => {
    // resolveProjectMeta maps Closed to the v2 board's Done column.
    expect(
      decideActions({
        eventName: "issues",
        action: "closed",
        issueNumber: 5,
        stateReason: "not_planned",
        title: "Fix it",
        labels: ["v2-rewrite"],
      }),
    ).toEqual([
      {
        issue: 5,
        board: "v2",
        actions: [
          { type: "removeFromBoard" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Closed" },
        ],
      },
    ]);
  });

  it("a PR merged into v2-rewrite moves its issue to Done on the v2 board", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "v2-rewrite",
        merged: true,
        linkedIssues: [7],
        excludedIssues: [7],
      }),
    ).toEqual([
      {
        issue: 7,
        board: "v2",
        actions: [
          { type: "removeFromBoard" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "closeIssue" },
        ],
      },
    ]);
  });

  it("adding the v2-rewrite label moves the card to the v2 board", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "v2-rewrite",
        title: "Fix it",
        labels: ["v2-rewrite"],
      }),
    ).toEqual([
      {
        issue: 5,
        board: "v2",
        actions: [{ type: "removeFromBoard" }, { type: "ensureOnBoard" }],
      },
    ]);
  });

  it("swaps the exclusive labels and sets the status on the v2 board", () => {
    expect(
      decideActions({
        eventName: "issues",
        action: "labeled",
        issueNumber: 5,
        labelName: "ready",
        title: "V2 rewrite: editor",
        labels: ["ready"],
      }),
    ).toEqual([
      {
        issue: 5,
        board: "v2",
        actions: [
          { type: "removeLabel", label: "progressing" },
          { type: "removeFromBoard" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Ready" },
        ],
      },
    ]);
  });

  it("a merged PR closes and assigns an excluded issue on the v2 board", () => {
    expect(
      decideActions({
        eventName: "pull_request",
        action: "closed",
        baseRef: "main",
        merged: true,
        linkedIssues: [5, 7],
        excludedIssues: [7],
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
      {
        issue: 7,
        board: "v2",
        actions: [
          { type: "removeFromBoard" },
          { type: "ensureOnBoard" },
          { type: "setStatus", status: "Done" },
          { type: "removeLabel", label: "progressing" },
          { type: "assignIfUnassigned", login: "octocat" },
          { type: "closeIssue" },
        ],
      },
    ]);
  });
});

describe("removeFromBoard", () => {
  const issueWith = (items: { id: string; project: { id: string } }[]) =>
    new Response(
      JSON.stringify({
        data: {
          repository: {
            issue: { id: "I", projectItems: { nodes: items } },
          },
        },
      }),
      { status: 200 },
    );

  it("deletes the card on this board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        issueWith([
          { id: "OTHER", project: { id: "P28" } },
          { id: "ITEM", project: { id: "P" } },
        ]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { deleteProjectV2Item: { deletedItemId: "ITEM" } },
          }),
          { status: 200 },
        ),
      );
    await removeFromBoard(
      "o",
      "r",
      5,
      { projectId: "P" },
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.query).toContain("deleteProjectV2Item");
    expect(body.variables).toEqual({ project: "P", item: "ITEM" });
  });

  it("does nothing when the issue is not on this board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        issueWith([{ id: "OTHER", project: { id: "P28" } }]),
      );
    await removeFromBoard(
      "o",
      "r",
      5,
      { projectId: "P" },
      "tok",
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
