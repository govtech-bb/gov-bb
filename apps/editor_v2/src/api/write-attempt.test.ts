import { expect, test, vi } from "vitest";
import {
  ApiAnswerMalformed,
  ApiFailure,
  CategoryAccessDenied,
  CategoryConflict,
  CategoryInUse,
  CategoryNotFound,
  CategoryOutcomeUnknown,
  CategoryRefused,
  CategoryRejected,
  createEditorApi,
  type EditorApi,
  type ApiPage,
  type PageHistoryEntry,
  type CreatePageInput,
  type ApiRevision,
  type RecordDetail,
} from "./client";
import { writeAttempt } from "./write-attempt";
import { moveOrder, type Category, type CategoryFields } from "./categories";
import { writes, type RecordWrite, type PageSaveRequest, type PageRestoreRequest } from "./writes";
import { markdownToPageSaveInput, pageToMarkdown } from "./page-markdown";

const base: RecordDetail = {
  collection: {
    key: "contacts",
    title: "Contacts",
    schema_version: 1,
    updated_at: "2026-11-11T12:00:00.000Z",
    record_key: "key",
    schema: {
      fields: [
        { key: "key", label: "Key", type: "slug" },
        { key: "name", label: "Name", type: "text" },
      ],
    },
  },
  record: {
    record_key: "nis",
    version: 1,
    updated_at: "2026-11-11T12:00:00.000Z",
    data: { key: "nis", name: "National Insurance" },
  },
};

const sent: RecordWrite = { ...base, key: "nis", data: { key: "nis", name: "Submitted" } };

const saved: RecordDetail = { ...base, record: { ...base.record, version: 2, data: sent.data } };

const errors = [{ field: "name", message: "Enter a name" }];

function fakeApi() {
  return {
    ...createEditorApi("https://content.test"),
    page: vi.fn<EditorApi["page"]>(),
    history: vi.fn<EditorApi["history"]>(),
    restoreVersion: vi.fn<EditorApi["restoreVersion"]>(),
    createPage: vi.fn<EditorApi["createPage"]>(),
    deletePage: vi.fn<EditorApi["deletePage"]>(),
    services: vi.fn<EditorApi["services"]>(),
    service: vi.fn<EditorApi["service"]>(),
    sitePages: vi.fn<EditorApi["sitePages"]>(),
    savePage: vi.fn<EditorApi["savePage"]>(),
    submitRevision: vi.fn<EditorApi["submitRevision"]>(),
    revision: vi.fn<EditorApi["revision"]>(),
    publishRevision: vi.fn<EditorApi["publishRevision"]>(),
    rejectRevision: vi.fn<EditorApi["rejectRevision"]>(),
    record: vi.fn<EditorApi["record"]>().mockResolvedValue(base),
    saveRecord: vi.fn<EditorApi["saveRecord"]>().mockResolvedValue(saved),
    createRecord: vi.fn<EditorApi["createRecord"]>().mockResolvedValue(saved.record),
    deleteRecord: vi.fn<EditorApi["deleteRecord"]>().mockResolvedValue(undefined),
    categories: vi.fn<EditorApi["categories"]>(),
    createCategory: vi.fn<EditorApi["createCategory"]>(),
    orderCategories: vi.fn<EditorApi["orderCategories"]>(),
    updateCategory: vi.fn<EditorApi["updateCategory"]>(),
    deleteCategory: vi
      .fn<EditorApi["deleteCategory"]>()
      .mockResolvedValue({ ok: true, value: undefined }),
  };
}

test("a landed save returns the API answer without reading back", async () => {
  const api = fakeApi();
  const attempt = writeAttempt(writes.saveRecord(api));
  expect(attempt.state).toBe("idle");
  expect(await attempt.press(() => sent)).toEqual({ kind: "landed", answer: saved });
  expect(attempt.state).toBe("idle");
  expect(api.record).not.toHaveBeenCalled();
});

test.each([
  [new ApiFailure(422, errors), { kind: "invalid", errors }],
  [
    new ApiFailure(400, errors, "Invalid", "validation_failed"),
    { kind: "invalid", errors, message: "Invalid" },
  ],
  [
    new ApiFailure(409, [], "Changed", "version_conflict"),
    { kind: "conflict", message: "Changed" },
  ],
  [new ApiFailure(404), { kind: "missing" }],
  [new ApiFailure(401), { kind: "signed-out" }],
  [new ApiFailure(403, [], "Editors only"), { kind: "forbidden", message: "Editors only" }],
  [
    new ApiFailure(409, [], "Taken", "record_exists"),
    { kind: "refused", code: "record_exists", message: "Taken" },
  ],
  [
    new ApiFailure(400, [], "Bad request", "bad_request"),
    { kind: "refused", code: "bad_request", message: "Bad request" },
  ],
])("classifies an answered refusal: %s", async (failure, outcome) => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValueOnce(failure);
  const attempt = writeAttempt(writes.saveRecord(api));
  expect(await attempt.press(() => sent)).toEqual(outcome);
  expect(attempt.state).toBe("idle");
  expect(api.record).not.toHaveBeenCalled();
  const next = { ...sent, data: { ...sent.data, name: "Corrected" } };
  await attempt.press(() => next);
  expect(api.saveRecord).toHaveBeenLastCalledWith("contacts", "nis", next.data, 1);
});

test.each([new ApiFailure(0), new ApiFailure(503), new ApiAnswerMalformed()])(
  "a lost answer is read back once automatically, never resent: %s",
  async (failure) => {
    const api = fakeApi();
    api.saveRecord.mockRejectedValue(failure);
    const attempt = writeAttempt(writes.saveRecord(api));
    expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
    expect(attempt.state).toBe("unsettled");
    expect(api.record).toHaveBeenCalledTimes(1);
    expect(api.saveRecord).toHaveBeenCalledTimes(1);
  },
);

test("a lost save is confirmed by its automatic read-back", async () => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValueOnce(new ApiFailure(0));
  api.record.mockResolvedValue(saved);
  const attempt = writeAttempt(writes.saveRecord(api));
  expect(await attempt.press(() => sent)).toEqual({ kind: "landed", answer: saved });
  expect(attempt.state).toBe("idle");
  expect(api.saveRecord).toHaveBeenCalledTimes(1);
});

test("the next press checks again and confirms without consulting next or resending", async () => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValueOnce(new ApiFailure(0));
  const attempt = writeAttempt(writes.saveRecord(api));
  await attempt.press(() => sent);
  api.record.mockResolvedValue(saved);
  const next = vi.fn(() => sent);
  expect(await attempt.press(next)).toEqual({ kind: "landed", answer: saved });
  expect(next).not.toHaveBeenCalled();
  expect(api.record).toHaveBeenCalledTimes(2);
  expect(api.saveRecord).toHaveBeenCalledTimes(1);
});

test("the next press reads first, then resends the frozen request unchanged", async () => {
  const api = fakeApi();
  const input = structuredClone(sent);
  api.saveRecord.mockRejectedValueOnce(new ApiFailure(503));
  const attempt = writeAttempt(writes.saveRecord(api));
  await attempt.press(() => input);
  input.data.name = "New typing";
  input.record!.version = 99;
  const next = vi.fn(() => input);
  expect(await attempt.press(next)).toEqual({ kind: "landed", answer: saved });
  expect(next).not.toHaveBeenCalled();
  expect(api.saveRecord.mock.calls).toEqual([
    ["contacts", "nis", sent.data, 1],
    ["contacts", "nis", sent.data, 1],
  ]);
  expect(api.record).toHaveBeenCalledTimes(2);
  expect(api.record.mock.invocationCallOrder[1]).toBeLessThan(
    api.saveRecord.mock.invocationCallOrder[1]!,
  );
});

test("only one request is in flight through sending and checking; forget cannot unlock it", async () => {
  const api = fakeApi();
  const send = Promise.withResolvers<RecordDetail>();
  const read = Promise.withResolvers<RecordDetail>();
  api.saveRecord.mockReturnValue(send.promise);
  api.record.mockReturnValue(read.promise);
  const attempt = writeAttempt(writes.saveRecord(api));
  const first = attempt.press(() => sent);
  expect(attempt.state).toBe("sending");
  const next = vi.fn(() => sent);
  expect(attempt.press(next)).toBe(first);
  attempt.forget();
  expect(attempt.state).toBe("sending");
  send.reject(new ApiFailure(0));
  await vi.waitFor(() => expect(attempt.state).toBe("checking"));
  expect(attempt.press(next)).toBe(first);
  expect(next).not.toHaveBeenCalled();
  read.resolve(base);
  expect(await first).toEqual({ kind: "unknown" });
  expect(api.saveRecord).toHaveBeenCalledTimes(1);
  expect(api.record).toHaveBeenCalledTimes(1);
});

test("a failed read leaves the attempt unsettled, and an explicit press may resend", async () => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValueOnce(new ApiAnswerMalformed());
  api.record.mockRejectedValue(new ApiFailure(503));
  const attempt = writeAttempt(writes.saveRecord(api));
  expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
  expect(attempt.state).toBe("unsettled");
  expect(await attempt.press(() => sent)).toEqual({ kind: "landed", answer: saved });
  expect(api.record).toHaveBeenCalledTimes(2);
  expect(api.saveRecord).toHaveBeenCalledTimes(2);
});

test("another lost answer after an explicit resend gets one read-back, not another resend", async () => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValue(new ApiFailure(0));
  const attempt = writeAttempt(writes.saveRecord(api));
  await attempt.press(() => sent);
  expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
  expect(api.saveRecord).toHaveBeenCalledTimes(2);
  expect(api.record).toHaveBeenCalledTimes(3);
  expect(attempt.state).toBe("unsettled");
});

test("discard-and-reload forgets an unsettled request so the next press uses fresh input", async () => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValueOnce(new ApiFailure(0));
  const attempt = writeAttempt(writes.saveRecord(api));
  await attempt.press(() => sent);
  attempt.forget();
  expect(attempt.state).toBe("idle");
  await attempt.press(() => ({
    ...sent,
    record: saved.record,
    data: { key: "nis", name: "After reload" },
  }));
  expect(api.saveRecord).toHaveBeenLastCalledWith(
    "contacts",
    "nis",
    { key: "nis", name: "After reload" },
    2,
  );
  expect(api.record).toHaveBeenCalledTimes(1);
});

test.each([
  { ...saved, record: { ...saved.record, version: 1 } },
  { ...saved, record: { ...saved.record, data: { key: "nis", name: "Someone else's save" } } },
])("a save needs both a changed version and matching fields", async (found) => {
  const api = fakeApi();
  api.saveRecord.mockRejectedValue(new ApiFailure(0));
  api.record.mockResolvedValue(found);
  expect(await writeAttempt(writes.saveRecord(api)).press(() => sent)).toEqual({ kind: "unknown" });
});

test("a lost create is confirmed by matching fields at the submitted key", async () => {
  const api = fakeApi();
  api.createRecord.mockRejectedValueOnce(new ApiFailure(0));
  api.record.mockResolvedValue(saved);
  const attempt = writeAttempt(writes.createRecord(api));
  expect(await attempt.press(() => ({ ...sent, record: undefined }))).toEqual({
    kind: "landed",
    answer: saved,
  });
  expect(api.record).toHaveBeenCalledWith("contacts", "nis");
  expect(api.createRecord).toHaveBeenCalledTimes(1);
});

test("a different record at the submitted key is not confirmation; an explicit resend is refused", async () => {
  const api = fakeApi();
  api.createRecord
    .mockRejectedValueOnce(new ApiFailure(0))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Taken", "record_exists"));
  const attempt = writeAttempt(writes.createRecord(api));
  expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
  expect(await attempt.press(() => sent)).toEqual({
    kind: "refused",
    code: "record_exists",
    message: "Taken",
  });
});

test("an absent create is resent only on the next press", async () => {
  const api = fakeApi();
  api.createRecord.mockRejectedValueOnce(new ApiFailure(0));
  api.record.mockRejectedValue(new ApiFailure(404));
  const attempt = writeAttempt(writes.createRecord(api));
  expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
  expect(api.createRecord).toHaveBeenCalledTimes(1);
  expect(await attempt.press(() => sent)).toEqual({ kind: "landed", answer: saved });
  expect(api.createRecord).toHaveBeenCalledTimes(2);
});

test("a lost deletion is confirmed only by absence, not an unavailable read", async () => {
  const api = fakeApi();
  api.deleteRecord.mockRejectedValueOnce(new ApiFailure(0));
  api.record.mockRejectedValueOnce(new ApiFailure(503)).mockRejectedValueOnce(new ApiFailure(404));
  const attempt = writeAttempt(writes.deleteRecord(api));
  const next = () => ({ collection: "contacts", key: "nis", version: 1 });
  expect(await attempt.press(next)).toEqual({ kind: "unknown" });
  expect(await attempt.press(next)).toEqual({ kind: "landed", answer: undefined });
  expect(api.deleteRecord).toHaveBeenCalledTimes(1);
});

test("a replacement record is not deleted by retrying the frozen version", async () => {
  const api = fakeApi();
  api.deleteRecord
    .mockRejectedValueOnce(new ApiFailure(0))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.record.mockResolvedValue(saved);
  const attempt = writeAttempt(writes.deleteRecord(api));
  await attempt.press(() => ({ collection: "contacts", key: "nis", version: 1 }));
  expect(await attempt.press(() => ({ collection: "contacts", key: "nis", version: 2 }))).toEqual({
    kind: "conflict",
    message: "Changed",
  });
  expect(api.deleteRecord.mock.calls).toEqual([
    ["contacts", "nis", 1],
    ["contacts", "nis", 1],
  ]);
});

test("a tagged validation refusal returns field errors", async () => {
  const api = fakeApi();
  api.updateCategory.mockResolvedValue({
    ok: false,
    error: new CategoryRejected(errors, "Invalid"),
  });

  const attempt = writeAttempt({
    send: () =>
      api.updateCategory(
        "category",
        { title: "Changed", slug: "changed", description: null, parent_id: null },
        1,
      ),
    readBack: async () => undefined,
    landed: () => false,
  });

  expect(await attempt.press(() => undefined)).toEqual({
    kind: "invalid",
    errors,
    message: "Invalid",
  });
});

test("a successful tagged answer keeps the write's declared answer shape", async () => {
  const api = fakeApi();

  const attempt = writeAttempt({
    send: () => api.deleteCategory("category", 1),
    readBack: async () => undefined,
    landed: () => false,
  });

  expect(await attempt.press(() => undefined)).toEqual({
    kind: "landed",
    answer: { ok: true, value: undefined },
  });
});

const blockers = { pages: 1, subcategories: 0, reserved_route: false };

test.each([
  [new CategoryConflict("Changed"), { kind: "conflict", message: "Changed" }],
  [new CategoryNotFound("Gone"), { kind: "missing", message: "Gone" }],
  [new CategoryAccessDenied(401, "Sign in"), { kind: "signed-out", message: "Sign in" }],
  [new CategoryAccessDenied(403, "Editors only"), { kind: "forbidden", message: "Editors only" }],
  [
    new CategoryInUse("Still used", blockers),
    { kind: "refused", code: "category_in_use", message: "Still used", detail: blockers },
  ],
  [
    new CategoryRefused(400, "Bad request"),
    { kind: "refused", message: "Bad request", code: undefined },
  ],
  [
    new CategoryRefused(422, "Unreadable validation"),
    { kind: "refused", message: "Unreadable validation", code: undefined },
  ],
  [new CategoryOutcomeUnknown("delete", new ApiFailure(0)), { kind: "unknown" }],
])(
  "classifies tagged category failures without adding a catalogue entry: %s",
  async (error, outcome) => {
    const api = fakeApi();
    api.deleteCategory.mockResolvedValue({ ok: false, error });
    const readBack = vi.fn(async () => undefined);

    const attempt = writeAttempt({
      send: () => api.deleteCategory("category", 1),
      readBack,
      landed: () => false,
    });

    expect(await attempt.press(() => undefined)).toEqual(outcome);
    expect(readBack).toHaveBeenCalledTimes(outcome.kind === "unknown" ? 1 : 0);
  },
);

const page: ApiPage = {
  id: "page",
  version: 1,
  url: "/fees",
  slug: "fees",
  parent_id: null,
  category_id: null,
  title: "Fees",
  description: null,
  visibility: "public",
  form_id: null,
  body_markdown: "Original",
  frontmatter: {},
  pending_revision: null,
  last_edited_by: null,
  updated_at: "2026-11-11T12:00:00.000Z",
  created_at: "2026-11-11T12:00:00.000Z",
  published_at: "2026-11-11T12:00:00.000Z",
};

const savedPage: ApiPage = {
  ...page,
  version: 2,
  body_markdown: "Submitted",
  pending_revision: { status: "draft", comment: null },
};

const edited = pageToMarkdown(savedPage, []);

const fields = markdownToPageSaveInput(edited, page, []);

if (!fields.ok) throw new Error("Page fixture must be valid");

const pageRequest: PageSaveRequest = {
  base: { page, markdown: pageToMarkdown(page, []) },
  markdown: edited,
  fields: fields.value,
  categories: [],
  hiding: false,
};

test("a lost page save is confirmed with its submitted Markdown and new version", async () => {
  const api = fakeApi();
  api.savePage.mockRejectedValueOnce(new ApiFailure(0));
  api.page.mockResolvedValue(savedPage);
  const attempt = writeAttempt(writes.savePage(api));
  expect(await attempt.press(() => pageRequest)).toEqual({
    kind: "landed",
    answer: { base: { page: savedPage, markdown: edited } },
  });
  expect(api.savePage).toHaveBeenCalledTimes(1);
  expect(api.savePage).toHaveBeenCalledWith(page.id, fields.value, 1);
});

test.each([
  ["the page has not moved", { ...savedPage, version: 1 }],
  ["the text differs", { ...savedPage, body_markdown: "Someone else's" }],
  [
    "the review moved on",
    { ...savedPage, pending_revision: { status: "submitted" as const, comment: null } },
  ],
])(
  "a lost page save is not confirmed when %s; only a press resends the original",
  async (_name, found) => {
    const api = fakeApi();
    api.savePage.mockRejectedValueOnce(new ApiFailure(0)).mockResolvedValue(savedPage);
    api.page.mockResolvedValue(found);
    const attempt = writeAttempt(writes.savePage(api));
    expect(await attempt.press(() => pageRequest)).toEqual({ kind: "unknown" });
    expect(api.savePage).toHaveBeenCalledTimes(1);
    expect(
      await attempt.press(() => ({
        ...pageRequest,
        base: { page: found, markdown: "Newer typing" },
      })),
    ).toMatchObject({ kind: "landed" });
    expect(api.savePage.mock.calls).toEqual([
      [page.id, fields.value, 1],
      [page.id, fields.value, 1],
    ]);
  },
);

test("a lost hiding save confirms restored live content, not the discarded revision", async () => {
  const api = fakeApi();
  const hidden: ApiPage = { ...page, version: 3, visibility: "preview" };
  api.savePage.mockRejectedValueOnce(new ApiFailure(503));
  api.page.mockResolvedValue(hidden);

  const sent: PageSaveRequest = {
    ...pageRequest,
    base: { page: savedPage, markdown: edited },
    fields: { ...fields.value, visibility: "preview" },
    markdown: pageToMarkdown({ ...savedPage, visibility: "preview" }, []),
    hiding: true,
  };

  expect(await writeAttempt(writes.savePage(api)).press(() => sent)).toEqual({
    kind: "landed",
    answer: { base: { page: hidden, markdown: pageToMarkdown(hidden, []) }, discarded: true },
  });
});

test("a hiding save still waiting for review is not confirmation", async () => {
  const api = fakeApi();
  api.savePage.mockRejectedValue(new ApiFailure(0));
  api.page.mockResolvedValue({ ...savedPage, visibility: "preview" });
  expect(
    await writeAttempt(writes.savePage(api)).press(() => ({
      ...pageRequest,
      fields: { ...fields.value, visibility: "preview" },
      hiding: true,
    })),
  ).toEqual({ kind: "unknown" });
});

test("an ordinary page save needs no pending revision when it writes a non-public page", async () => {
  const api = fakeApi();
  const draft: ApiPage = { ...page, visibility: "draft" };
  const saved: ApiPage = { ...draft, version: 2, body_markdown: "Submitted" };
  api.savePage.mockRejectedValueOnce(new ApiFailure(0));
  api.page.mockResolvedValue(saved);
  expect(
    await writeAttempt(writes.savePage(api)).press(() => ({
      ...pageRequest,
      base: { page: draft, markdown: pageToMarkdown(draft, []) },
      fields: { ...fields.value, visibility: "draft" },
      markdown: pageToMarkdown(saved, []),
    })),
  ).toEqual({
    kind: "landed",
    answer: { base: { page: saved, markdown: pageToMarkdown(saved, []) } },
  });
});

const submittedPage: ApiPage = {
  ...savedPage,
  version: 3,
  pending_revision: { status: "submitted", comment: null },
};

const submission = { base: { page: savedPage, markdown: edited }, categories: [] };

test("a lost save to a review already submitted is confirmed without mistaking that status for another submission", async () => {
  const api = fakeApi();
  const waiting = { ...page, pending_revision: { status: "submitted" as const, comment: null } };
  api.savePage.mockRejectedValueOnce(new ApiFailure(0));
  api.page.mockResolvedValue(submittedPage);
  expect(
    await writeAttempt(writes.savePage(api)).press(() => ({
      ...pageRequest,
      base: { page: waiting, markdown: pageToMarkdown(waiting, []) },
    })),
  ).toEqual({ kind: "landed", answer: { base: { page: submittedPage, markdown: edited } } });
});

test("a submission's answer advances only its submitted baseline", async () => {
  const api = fakeApi();
  api.submitRevision.mockResolvedValue({
    id: "revision",
    page_id: page.id,
    fields: { ...fields.value, parent_id: null },
    version: 3,
    status: "submitted",
    comment: null,
    updated_at: page.updated_at,
    contributors: [],
    changes: [],
    live_updated_at: page.updated_at,
    created_at: page.created_at,
    created_by: "editor",
    submitted_by: "editor",
    submitted_at: page.updated_at,
    decided_by: null,
    decided_at: null,
  });
  expect(await writeAttempt(writes.submitRevision(api)).press(() => submission)).toEqual({
    kind: "landed",
    answer: { page: submittedPage, markdown: edited },
  });
  expect(api.submitRevision).toHaveBeenCalledWith(page.id, 2);
  expect(api.page).not.toHaveBeenCalled();
});

test("a lost submission is confirmed automatically as waiting for review", async () => {
  const api = fakeApi();
  api.submitRevision.mockRejectedValue(new ApiFailure(0));
  api.page.mockResolvedValue(submittedPage);
  expect(await writeAttempt(writes.submitRevision(api)).press(() => submission)).toEqual({
    kind: "landed",
    answer: { page: submittedPage, markdown: edited },
  });
  expect(api.submitRevision).toHaveBeenCalledTimes(1);
});

test.each([
  ["the version has not moved", { ...submittedPage, version: 2 }],
  [
    "the review is still a draft",
    { ...submittedPage, pending_revision: { status: "draft" as const, comment: null } },
  ],
  ["the submitted text differs", { ...submittedPage, title: "Changed meanwhile" }],
])("a lost submission remains unsettled when %s", async (_name, found) => {
  const api = fakeApi();
  api.submitRevision.mockRejectedValueOnce(new ApiFailure(0));
  api.page.mockResolvedValue(found);
  const attempt = writeAttempt(writes.submitRevision(api));
  expect(await attempt.press(() => submission)).toEqual({ kind: "unknown" });
  expect(api.submitRevision).toHaveBeenCalledTimes(1);
  api.page.mockResolvedValue(submittedPage);
  expect(
    await attempt.press(() => ({ ...submission, base: { page: found, markdown: "New input" } })),
  ).toEqual({ kind: "landed", answer: { page: submittedPage, markdown: edited } });
  expect(api.submitRevision).toHaveBeenCalledTimes(1);
});

test("an explicit submission retry cannot adopt a newer read's version", async () => {
  const api = fakeApi();
  api.submitRevision
    .mockRejectedValueOnce(new ApiFailure(0))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.page.mockResolvedValue({ ...savedPage, version: 4 });
  const attempt = writeAttempt(writes.submitRevision(api));
  await attempt.press(() => submission);
  expect(
    await attempt.press(() => ({
      ...submission,
      base: { ...submission.base, page: submittedPage },
    })),
  ).toEqual({ kind: "conflict", message: "Changed" });
  expect(api.submitRevision.mock.calls).toEqual([
    [page.id, 2],
    [page.id, 2],
  ]);
});

test.each(["save", "submit"])("an absent page does not confirm %s", async (operation) => {
  const api = fakeApi();
  api.savePage.mockRejectedValue(new ApiFailure(0));
  api.submitRevision.mockRejectedValue(new ApiFailure(0));
  api.page.mockRejectedValue(new ApiFailure(404));

  const outcome =
    operation === "save"
      ? await writeAttempt(writes.savePage(api)).press(() => pageRequest)
      : await writeAttempt(writes.submitRevision(api)).press(() => submission);

  expect(outcome).toEqual({ kind: "unknown" });
});

test("a message-less non-version page conflict retains its review-state fallback", async () => {
  const api = fakeApi();
  api.savePage.mockRejectedValue(new ApiFailure(409));
  expect(await writeAttempt(writes.savePage(api)).press(() => pageRequest)).toEqual({
    kind: "refused",
    message: "This change cannot be saved in its current review state.",
  });
});

const category: Category = {
  id: "health",
  title: "Health",
  slug: "health",
  parent_id: null,
  description: null,
  url: "/health",
  position: 0,
  version: 1,
  services: 0,
  reserved_route: false,
  updated_at: "2026-11-11T12:00:00.000Z",
  last_edited_by: null,
};

const categoryFields: CategoryFields = {
  title: " Health services ",
  slug: "health",
  parent_id: null,
  description: " ",
};

const savedCategory: Category = { ...category, title: "Health services", version: 2 };

test.each(["createCategory", "saveCategory"] as const)(
  "%s confirms the submitted fields after a lost answer",
  async (entry) => {
    const api = fakeApi();
    const send = entry === "createCategory" ? api.createCategory : api.updateCategory;
    send.mockResolvedValue({
      ok: false,
      error: new CategoryOutcomeUnknown(
        entry === "createCategory" ? "create" : "update",
        new TypeError("Lost answer"),
      ),
    });
    api.categories.mockResolvedValue({ ok: true, value: [savedCategory] });
    const attempt = writeAttempt(writes[entry](api));
    expect(await attempt.press(() => ({ fields: categoryFields, base: category }))).toEqual({
      kind: "landed",
      answer: savedCategory,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(api.categories).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { slug: "another" },
  { parent_id: "parent" },
  { title: "Someone else's title" },
  { description: "Someone else's description" },
])("a category create does not confirm different fields: %s", async (difference) => {
  const api = fakeApi();
  api.createCategory.mockResolvedValue({
    ok: false,
    error: new CategoryOutcomeUnknown("create", new TypeError("Lost answer")),
  });
  api.categories.mockResolvedValue({ ok: true, value: [{ ...savedCategory, ...difference }] });
  expect(
    await writeAttempt(writes.createCategory(api)).press(() => ({ fields: categoryFields })),
  ).toEqual({ kind: "unknown" });
  expect(api.createCategory).toHaveBeenCalledTimes(1);
});

test("category save confirms an exact no-op without advancing its version", async () => {
  const api = fakeApi();
  api.updateCategory.mockResolvedValue({
    ok: false,
    error: new CategoryOutcomeUnknown("update", new TypeError("Lost answer")),
  });
  api.categories.mockResolvedValue({
    ok: true,
    value: [{ ...savedCategory, version: category.version }],
  });
  expect(
    await writeAttempt(writes.saveCategory(api)).press(() => ({
      fields: categoryFields,
      base: category,
    })),
  ).toEqual({ kind: "landed", answer: { ...savedCategory, version: 1 } });
});

test("a newer category version alone is not a landed save; retry keeps fields and version", async () => {
  const api = fakeApi();
  api.updateCategory
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryOutcomeUnknown("update", new TypeError("Lost answer")),
    })
    .mockResolvedValueOnce({ ok: false, error: new CategoryConflict("Changed elsewhere.") });
  api.categories.mockResolvedValue({ ok: true, value: [{ ...category, version: 9 }] });
  const attempt = writeAttempt(writes.saveCategory(api));
  const request = { fields: { ...categoryFields }, base: { ...category } };
  expect(await attempt.press(() => request)).toEqual({ kind: "unknown" });
  request.fields.title = "Later typing";
  request.base.version = 9;
  const next = vi.fn(() => request);
  expect(await attempt.press(next)).toEqual({ kind: "conflict", message: "Changed elsewhere." });
  expect(next).not.toHaveBeenCalled();
  expect(api.updateCategory).toHaveBeenLastCalledWith(category.id, categoryFields, 1);
  expect(api.categories).toHaveBeenCalledTimes(2);
});

test("an unsettled category create retries the original fields, even after its slug is vacated", async () => {
  const api = fakeApi();
  api.createCategory
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryOutcomeUnknown("create", new TypeError("Lost answer")),
    })
    .mockResolvedValueOnce({ ok: true, value: { ...savedCategory, id: "second" } });
  api.categories.mockResolvedValue({ ok: true, value: [{ ...savedCategory, slug: "renamed" }] });
  const attempt = writeAttempt(writes.createCategory(api));
  const request = { fields: { ...categoryFields } };
  expect(await attempt.press(() => request)).toEqual({ kind: "unknown" });
  request.fields.slug = "later-typing";
  expect(await attempt.press(() => request)).toEqual({
    kind: "landed",
    answer: { ...savedCategory, id: "second" },
  });
  expect(api.createCategory).toHaveBeenLastCalledWith(categoryFields);
  expect(api.createCategory).toHaveBeenCalledTimes(2);
});

test("a taken category slug refuses a retry rather than confirming different fields", async () => {
  const api = fakeApi();
  api.createCategory
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryOutcomeUnknown("create", new TypeError("Lost answer")),
    })
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryRejected([{ field: "slug", message: "Taken" }], "Taken"),
    });
  api.categories.mockResolvedValue({ ok: true, value: [category] });
  const attempt = writeAttempt(writes.createCategory(api));
  expect(await attempt.press(() => ({ fields: categoryFields }))).toEqual({ kind: "unknown" });
  expect(await attempt.press(() => ({ fields: categoryFields }))).toMatchObject({
    kind: "invalid",
    errors: [{ field: "slug", message: "Taken" }],
  });
});

test("a failed category deletion read is not absence; a later successful read confirms it", async () => {
  const api = fakeApi();
  api.deleteCategory.mockResolvedValue({
    ok: false,
    error: new CategoryOutcomeUnknown("delete", new TypeError("Lost answer")),
  });
  api.categories
    .mockResolvedValueOnce({ ok: false, error: new CategoryRefused(503, "Unavailable") })
    .mockResolvedValueOnce({ ok: true, value: [] });
  const attempt = writeAttempt(writes.deleteCategory(api));
  expect(await attempt.press(() => category)).toEqual({ kind: "unknown" });
  expect(await attempt.press(() => category)).toEqual({
    kind: "landed",
    answer: { category: undefined, checked: true },
  });
  expect(api.deleteCategory).toHaveBeenCalledExactlyOnceWith(category.id, category.version);
});

test("an existing category is not a confirmed deletion and a retry keeps the displayed version", async () => {
  const api = fakeApi();
  api.deleteCategory
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryOutcomeUnknown("delete", new TypeError("Lost answer")),
    })
    .mockResolvedValueOnce({ ok: false, error: new CategoryConflict("Changed elsewhere.") });
  api.categories.mockResolvedValue({ ok: true, value: [{ ...category, version: 7 }] });
  const attempt = writeAttempt(writes.deleteCategory(api));
  expect(await attempt.press(() => category)).toEqual({ kind: "unknown" });
  expect(await attempt.press(() => ({ ...category, version: 7 }))).toMatchObject({
    kind: "conflict",
  });
  expect(api.deleteCategory).toHaveBeenLastCalledWith(category.id, 1);
});

test("category deletion retains the API's occupancy blockers and sentence", async () => {
  const api = fakeApi();
  const blockers = { pages: 2, subcategories: 1, reserved_route: false };
  api.deleteCategory.mockResolvedValue({
    ok: false,
    error: new CategoryInUse("Still used.", blockers),
  });
  expect(await writeAttempt(writes.deleteCategory(api)).press(() => category)).toEqual({
    kind: "refused",
    code: "category_in_use",
    message: "Still used.",
    detail: blockers,
  });
});

const sibling: Category = {
  ...category,
  id: "schools",
  title: "Schools",
  slug: "schools",
  position: 1,
};

const order = moveOrder([category, sibling], sibling.id, -1)!;

const orderedCategories = [
  { ...sibling, position: 0, version: 3 },
  { ...category, position: 1, version: 4 },
];

test("a lost category order confirms its whole sibling group, excluding unrelated groups", async () => {
  const api = fakeApi();
  api.orderCategories.mockResolvedValue({
    ok: false,
    error: new CategoryOutcomeUnknown("order", new TypeError("Lost answer")),
  });
  api.categories.mockResolvedValue({
    ok: true,
    value: [...orderedCategories, { ...category, id: "child", parent_id: category.id }],
  });
  expect(await writeAttempt(writes.orderCategories(api)).press(() => order)).toEqual({
    kind: "landed",
    answer: { categories: orderedCategories, checked: true },
  });
  expect(api.orderCategories).toHaveBeenCalledTimes(1);
});

test.each([
  { found: [category, sibling] },
  { found: orderedCategories.slice(0, 1) },
  { found: [...orderedCategories, { ...category, id: "new-sibling", position: 2 }] },
])("a different sibling group does not confirm the frozen order: %s", async ({ found }) => {
  const api = fakeApi();
  api.orderCategories
    .mockResolvedValueOnce({
      ok: false,
      error: new CategoryOutcomeUnknown("order", new TypeError("Lost answer")),
    })
    .mockResolvedValueOnce({ ok: false, error: new CategoryConflict("Changed elsewhere.") });
  api.categories.mockResolvedValue({ ok: true, value: found });
  const attempt = writeAttempt(writes.orderCategories(api));
  const sentOrder = structuredClone(order);
  expect(await attempt.press(() => sentOrder)).toEqual({ kind: "unknown" });
  sentOrder.expected = sentOrder.expected.map((item) => ({ ...item, version: 99 }));
  sentOrder.ordered_ids.reverse();
  expect(await attempt.press(() => sentOrder)).toMatchObject({ kind: "conflict" });
  expect(api.orderCategories).toHaveBeenLastCalledWith(order);
});

test("a category no-op order is confirmed without requiring newer versions", () => {
  const api = fakeApi();
  const unchanged = { ...order, ordered_ids: [category.id, sibling.id] };
  expect(
    writes
      .orderCategories(api)
      .landed({ categories: [category, sibling], checked: true }, unchanged),
  ).toBe(true);
});

test.each([
  [400, ""],
  [409, "The API's own sentence."],
])(
  "category refusal %s retains the existing dialog fallback or API sentence",
  async (status, message) => {
    const api = fakeApi();
    api.createCategory.mockResolvedValue({
      ok: false,
      error: new CategoryRefused(status, "The API's own sentence."),
    });
    expect(
      await writeAttempt(writes.createCategory(api)).press(() => ({ fields: categoryFields })),
    ).toEqual({ kind: "refused", code: undefined, message });
  },
);

const reviewed: ApiRevision = {
  id: "revision",
  page_id: page.id,
  version: 7,
  status: "submitted",
  fields: {
    url: page.url,
    category_id: null,
    parent_id: null,
    title: "Reviewed title",
    description: null,
    visibility: "public",
    form_id: null,
    body_markdown: "Reviewed content",
    frontmatter: { lede: "office" },
  },
  live_updated_at: page.updated_at,
  created_by: "author",
  contributors: ["author"],
  submitted_by: "author",
  submitted_at: page.updated_at,
  decided_by: null,
  decided_at: null,
  comment: null,
  created_at: page.updated_at,
  updated_at: page.updated_at,
  changes: [{ field: "body_markdown", live: page.body_markdown, proposed: "Reviewed content" }],
};

const publishedPage: ApiPage = {
  ...page,
  ...reviewed.fields,
  version: 8,
  updated_at: "2026-11-11T12:01:00.000Z",
};

const rejectedRevision: ApiRevision = {
  ...reviewed,
  status: "rejected",
  version: 8,
  comment: "Check the fees.",
  decided_by: "approver",
  decided_at: publishedPage.updated_at,
  updated_at: publishedPage.updated_at,
};

test("publishing sends the displayed revision version and keeps its answered page", async () => {
  const api = fakeApi();
  api.publishRevision.mockResolvedValue(publishedPage);
  expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual({
    kind: "landed",
    answer: { page: publishedPage },
  });
  expect(api.publishRevision).toHaveBeenCalledExactlyOnceWith(page.id, 7);
  expect(api.revision).not.toHaveBeenCalled();
});

test("a lost publication needs an answered revision absence and the changed live page", async () => {
  const api = fakeApi();
  api.publishRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockRejectedValue(new ApiFailure(404));
  api.page.mockResolvedValue(publishedPage);
  expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual({
    kind: "landed",
    answer: { revision: undefined, page: publishedPage },
  });
  expect(api.revision).toHaveBeenCalledExactlyOnceWith(page.id);
  expect(api.page).toHaveBeenCalledExactlyOnceWith(page.id);
  expect(api.publishRevision).toHaveBeenCalledTimes(1);
});

test.each([
  { name: "revision read fails", revisionError: 503 },
  { name: "page read fails", pageError: 503 },
  { name: "page was deleted", pageError: 404 },
])("publication is unconfirmed when $name", async ({ revisionError, pageError }) => {
  const api = fakeApi();
  api.publishRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockRejectedValue(new ApiFailure(revisionError ?? 404));

  if (pageError) api.page.mockRejectedValue(new ApiFailure(pageError));
  else api.page.mockResolvedValue(publishedPage);
  expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual({
    kind: "unknown",
  });
});

test.each([
  { name: "same revision still submitted", current: reviewed },
  { name: "revision rejected instead", current: rejectedRevision },
  { name: "different revision", current: { ...reviewed, id: "other" } },
])("publication is unconfirmed with $name", async ({ current }) => {
  const api = fakeApi();
  api.publishRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockResolvedValue(current);
  api.page.mockResolvedValue(publishedPage);
  expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual({
    kind: "unknown",
  });
});

test.each([
  { id: "other-page" },
  { version: reviewed.version },
  { pending_revision: { status: "draft" as const, comment: null } },
  { visibility: "draft" as const },
  { updated_at: reviewed.live_updated_at },
  { title: "Other title" },
  { url: "/other" },
  { category_id: "other-category" },
  { parent_id: "other-parent" },
  { description: "Other description" },
  { form_id: "other-form" },
  { body_markdown: "Other body" },
  { frontmatter: { lede: "elsewhere" } },
])(
  "missing revision does not confirm a different or unchanged live page: %s",
  async (difference) => {
    const api = fakeApi();
    api.publishRevision.mockRejectedValue(new ApiFailure(0));
    api.revision.mockRejectedValue(new ApiFailure(404));
    api.page.mockResolvedValue({ ...publishedPage, ...difference });
    expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual({
      kind: "unknown",
    });
  },
);

test("an explicit publish retry keeps the reviewed version and snapshot after a failed read", async () => {
  const api = fakeApi();
  api.publishRevision
    .mockRejectedValueOnce(new ApiFailure(0))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.revision.mockRejectedValue(new ApiFailure(503));
  const snapshot = structuredClone(reviewed);
  const attempt = writeAttempt(writes.publishRevision(api));
  expect(await attempt.press(() => snapshot)).toEqual({ kind: "unknown" });
  snapshot.version = 99;
  snapshot.fields.title = "New revision";
  expect(await attempt.press(() => snapshot)).toMatchObject({ kind: "conflict" });
  expect(api.publishRevision).toHaveBeenLastCalledWith(reviewed.page_id, 7);
});

test("rejecting sends the reviewed version and submitted comment", async () => {
  const api = fakeApi();
  api.rejectRevision.mockResolvedValue(rejectedRevision);
  const sent = { reviewed, comment: "Check the fees." };
  expect(await writeAttempt(writes.rejectRevision(api)).press(() => sent)).toEqual({
    kind: "landed",
    answer: rejectedRevision,
  });
  expect(api.rejectRevision).toHaveBeenCalledExactlyOnceWith(page.id, sent.comment, 7);
  expect(api.revision).not.toHaveBeenCalled();
});

test("a lost rejection confirms the same revision, fields and submitted comment", async () => {
  const api = fakeApi();
  api.rejectRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockResolvedValue(rejectedRevision);
  expect(
    await writeAttempt(writes.rejectRevision(api)).press(() => ({
      reviewed,
      comment: "Check the fees.",
    })),
  ).toEqual({ kind: "landed", answer: rejectedRevision });
  expect(api.rejectRevision).toHaveBeenCalledTimes(1);
});

test.each([
  { id: "other-revision" },
  { page_id: "other-page" },
  { version: reviewed.version },
  { status: "submitted" as const },
  { comment: "Someone else's comment" },
  { fields: { ...reviewed.fields, body_markdown: "Other revision content" } },
])("rejection is not confirmed by a different reviewed state: %s", async (difference) => {
  const api = fakeApi();
  api.rejectRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockResolvedValue({ ...rejectedRevision, ...difference });
  expect(
    await writeAttempt(writes.rejectRevision(api)).press(() => ({
      reviewed,
      comment: "Check the fees.",
    })),
  ).toEqual({ kind: "unknown" });
});

test.each([404, 503])("a revision read answered %s cannot confirm rejection", async (status) => {
  const api = fakeApi();
  api.rejectRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockRejectedValue(new ApiFailure(status));
  expect(
    await writeAttempt(writes.rejectRevision(api)).press(() => ({
      reviewed,
      comment: "Check the fees.",
    })),
  ).toEqual({ kind: "unknown" });
});

test("a rejection retry cannot use a refreshed revision or a later comment", async () => {
  const api = fakeApi();
  api.rejectRevision
    .mockRejectedValueOnce(new ApiFailure(0))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.revision.mockResolvedValue({ ...rejectedRevision, id: "other-revision", version: 9 });
  const sent = { reviewed: structuredClone(reviewed), comment: "Check the fees." };
  const attempt = writeAttempt(writes.rejectRevision(api));
  expect(await attempt.press(() => sent)).toEqual({ kind: "unknown" });
  sent.reviewed.version = 9;
  sent.comment = "Later comment";
  expect(await attempt.press(() => sent)).toMatchObject({ kind: "conflict" });
  expect(api.rejectRevision).toHaveBeenLastCalledWith(reviewed.page_id, "Check the fees.", 7);
});

test.each([
  {
    failure: new ApiFailure(409, [], "Submit this first.", "not_submitted"),
    expected: { kind: "refused", code: "review_state_conflict", message: "Submit this first." },
  },
  {
    failure: new ApiFailure(409),
    expected: { kind: "refused", code: "review_state_conflict" },
  },
  {
    failure: new ApiFailure(409, [], "Changed", "version_conflict"),
    expected: { kind: "conflict", message: "Changed" },
  },
  {
    failure: new ApiFailure(400, [], "Bad request", "not_submitted"),
    expected: { kind: "refused", code: "not_submitted", message: "Bad request" },
  },
  {
    failure: new ApiFailure(
      400,
      [{ field: "comment", message: "Malformed" }],
      "Bad request",
      "validation_failed",
    ),
    expected: { kind: "refused", code: "review_request_refused", message: "Bad request" },
  },
  {
    failure: new ApiFailure(403, [], "You worked on this change."),
    expected: { kind: "forbidden", message: "You worked on this change." },
  },
])(
  "review decision mapping preserves the refusal distinction: $failure",
  async ({ failure, expected }) => {
    const api = fakeApi();
    api.publishRevision.mockRejectedValue(failure);
    api.rejectRevision.mockRejectedValue(failure);
    expect(await writeAttempt(writes.publishRevision(api)).press(() => reviewed)).toEqual(expected);
    expect(
      await writeAttempt(writes.rejectRevision(api)).press(() => ({ reviewed, comment: "Check." })),
    ).toEqual(expected);
    expect(api.revision).not.toHaveBeenCalled();
  },
);

test("matching non-public fields cannot confirm publication", async () => {
  const api = fakeApi();
  api.publishRevision.mockRejectedValue(new ApiFailure(0));
  api.revision.mockRejectedValue(new ApiFailure(404));
  api.page.mockResolvedValue({ ...publishedPage, visibility: "draft" });
  expect(
    await writeAttempt(writes.publishRevision(api)).press(() => ({
      ...reviewed,
      fields: { ...reviewed.fields, visibility: "draft" },
    })),
  ).toEqual({ kind: "unknown" });
});

const newPageInput: CreatePageInput = {
  url: "/family/birth",
  title: "Birth",
  category_id: "family",
  visibility: "preview",
  body_markdown: "",
  frontmatter: { stage: "alpha" },
};

const newPage: ApiPage = {
  ...page,
  ...newPageInput,
  parent_id: null,
  category_id: "family",
  visibility: "preview",
  frontmatter: { stage: "alpha" },
  slug: "birth",
  published_at: null,
};

const newService = {
  id: newPage.id,
  url: newPage.url,
  title: newPage.title,
  category: { slug: "family", title: "Family" },
  visibility: newPage.visibility,
  form_id: null,
  has_start_page: false,
  page_count: 1,
  updated_at: newPage.updated_at,
};

function pageCreationApi() {
  const api = fakeApi();
  api.createPage.mockRejectedValue(new ApiFailure(0));
  api.services.mockResolvedValue([newService]);
  api.page.mockResolvedValue(newPage);

  return api;
}

test("page creation accepts an answered page without reading an index", async () => {
  const api = pageCreationApi();
  api.createPage.mockResolvedValue(newPage);
  expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual({
    kind: "landed",
    answer: newPage,
  });
  expect(api.createPage).toHaveBeenCalledWith(newPageInput);
  expect(api.services).not.toHaveBeenCalled();
  expect(api.page).not.toHaveBeenCalled();
});

test("a lost service create reads the editing index and the actual page once", async () => {
  const api = pageCreationApi();
  expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual({
    kind: "landed",
    answer: newPage,
  });
  expect(api.services).toHaveBeenCalledTimes(1);
  expect(api.page.mock.calls).toEqual([[newPage.id]]);
  expect(api.createPage).toHaveBeenCalledTimes(1);
});

test.each([
  ["url", "/elsewhere"],
  ["parent_id", "another-parent"],
  ["category_id", "another-category"],
  ["title", "Someone else's title"],
  ["description", "Different"],
  ["visibility", "public"],
  ["form_id", "another-form"],
  ["body_markdown", "Different"],
  ["frontmatter", {}],
  ["pending_revision", { status: "draft", comment: null }],
  ["id", "different-index-identity"],
] as const)(
  "page create does not confirm a matching index path with different %s",
  async (field, value) => {
    const api = pageCreationApi();
    api.page.mockResolvedValue({ ...newPage, [field]: value });
    expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual({
      kind: "unknown",
    });
    expect(api.createPage).toHaveBeenCalledTimes(1);
  },
);

test("page creation checks a supplied identity too, without generating one", async () => {
  const api = pageCreationApi();
  expect(
    await writeAttempt(writes.createPage(api)).press(() => ({ ...newPageInput, id: "specified" })),
  ).toEqual({ kind: "unknown" });
});

test.each([new ApiFailure(0), new ApiFailure(503), new ApiAnswerMalformed(), new ApiFailure(404)])(
  "failed page creation index or full-page reads cannot confirm: %s",
  async (failure) => {
    for (const read of ["index", "page"] as const) {
      const api = pageCreationApi();

      if (read === "index") api.services.mockRejectedValue(failure);
      else api.page.mockRejectedValue(failure);
      expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual({
        kind: "unknown",
      });
      expect(api.createPage).toHaveBeenCalledTimes(1);
    }
  },
);

test("a lost create whose path is absent stays unknown, then resends only the frozen input", async () => {
  const api = pageCreationApi();
  api.services.mockResolvedValue([]);
  const input = structuredClone(newPageInput);
  const attempt = writeAttempt(writes.createPage(api));
  expect(await attempt.press(() => input)).toEqual({ kind: "unknown" });
  input.title = "Later typing";
  input.url = "/different";
  input.frontmatter!.stage = "beta";
  api.createPage.mockResolvedValue(newPage);
  const next = vi.fn(() => input);
  expect((await attempt.press(next)).kind).toBe("landed");
  expect(next).not.toHaveBeenCalled();
  expect(api.createPage.mock.calls).toEqual([[newPageInput], [newPageInput]]);
  expect(api.services).toHaveBeenCalledTimes(2);
  expect(api.services.mock.invocationCallOrder[1]).toBeLessThan(
    api.createPage.mock.invocationCallOrder[1]!,
  );
});

test("a later matching create read confirms without sending again", async () => {
  const api = pageCreationApi();
  api.services.mockResolvedValueOnce([]);
  const attempt = writeAttempt(writes.createPage(api));
  await attempt.press(() => newPageInput);
  expect((await attempt.press(() => newPageInput)).kind).toBe("landed");
  expect(api.createPage).toHaveBeenCalledTimes(1);
});

test("an uncategorised root create uses the site-page index and documented defaults", async () => {
  const api = pageCreationApi();
  const input = { url: "/fees", title: "Fees", body_markdown: "" };

  const found: ApiPage = {
    ...page,
    ...input,
    category_id: null,
    visibility: "draft",
    frontmatter: {},
  };

  api.sitePages.mockResolvedValue([found]);
  api.page.mockResolvedValue(found);
  expect((await writeAttempt(writes.createPage(api)).press(() => input)).kind).toBe("landed");
  expect(api.sitePages).toHaveBeenCalledTimes(1);
  expect(api.services).not.toHaveBeenCalled();
});

function childCreationApi() {
  const api = pageCreationApi();

  const input: CreatePageInput = {
    url: "/family/birth/start",
    title: "Before you start",
    parent_id: "parent",
    visibility: "preview",
    body_markdown: "",
  };

  const child: ApiPage = { ...newPage, ...input, parent_id: "parent", frontmatter: {} };
  api.service.mockResolvedValue({
    service: { ...newService, id: "parent" },
    pages: [{ ...child, role: "start" }],
  });
  api.page.mockResolvedValue(child);

  return { api, input, child };
}

test("a lost child create confirms without comparing the category it inherited", async () => {
  const { api, input, child } = childCreationApi();
  expect(await writeAttempt(writes.createPage(api)).press(() => input)).toEqual({
    kind: "landed",
    answer: child,
  });
  expect(api.service).toHaveBeenCalledWith("parent");
  expect(api.page.mock.calls).toEqual([[child.id]]);
  expect(api.services).not.toHaveBeenCalled();
});

test("a root create that names no category is not confirmed by a categorised page", async () => {
  const api = pageCreationApi();
  const input = { url: "/fees", title: "Fees", body_markdown: "" };
  const found: ApiPage = { ...page, ...input, visibility: "draft", frontmatter: {} };
  api.sitePages.mockResolvedValue([found]);
  api.page.mockResolvedValue({ ...found, category_id: "family" });
  expect(await writeAttempt(writes.createPage(api)).press(() => input)).toEqual({
    kind: "unknown",
  });
});

test("page create compares explicitly submitted optional fields instead of defaults", async () => {
  const api = pageCreationApi();

  const input: CreatePageInput = {
    ...newPageInput,
    description: "Details",
    form_id: "form",
    frontmatter: { stage: "alpha", lede: "Intro" },
  };

  api.page.mockResolvedValue({
    ...newPage,
    description: "Details",
    form_id: "form",
    frontmatter: input.frontmatter!,
  });
  expect((await writeAttempt(writes.createPage(api)).press(() => input)).kind).toBe("landed");
});

test("an answered page deletion needs no read-back", async () => {
  const api = fakeApi();
  api.deletePage.mockResolvedValue(undefined);
  expect(
    await writeAttempt(writes.deletePage(api)).press(() => ({ id: page.id, version: 1 })),
  ).toEqual({
    kind: "landed",
    answer: undefined,
  });
  expect(api.deletePage).toHaveBeenCalledWith(page.id, 1);
  expect(api.page).not.toHaveBeenCalled();
});

test("only an answered 404 confirms a lost page deletion", async () => {
  const api = fakeApi();
  api.deletePage.mockRejectedValue(new ApiFailure(0));
  api.page.mockRejectedValue(new ApiFailure(404));
  expect(
    await writeAttempt(writes.deletePage(api)).press(() => ({ id: page.id, version: 1 })),
  ).toEqual({
    kind: "landed",
    answer: undefined,
  });
  expect(api.page).toHaveBeenCalledWith(page.id);
  expect(api.deletePage).toHaveBeenCalledTimes(1);
});

test.each([new ApiFailure(0), new ApiFailure(503), new ApiAnswerMalformed()])(
  "a failed deletion read is not absence: %s",
  async (failure) => {
    const api = fakeApi();
    api.deletePage.mockRejectedValue(new ApiFailure(0));
    api.page.mockRejectedValue(failure);
    expect(
      await writeAttempt(writes.deletePage(api)).press(() => ({ id: page.id, version: 1 })),
    ).toEqual({ kind: "unknown" });
    expect(api.deletePage).toHaveBeenCalledTimes(1);
  },
);

test("a remaining page cannot confirm deletion; a retry keeps its displayed identity and version", async () => {
  const api = fakeApi();
  api.deletePage
    .mockRejectedValueOnce(new ApiFailure(503))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.page.mockResolvedValue({ ...page, version: 99 });
  const input = { id: page.id, version: 1 };
  const attempt = writeAttempt(writes.deletePage(api));
  expect(await attempt.press(() => input)).toEqual({ kind: "unknown" });
  input.id = "another-page";
  input.version = 99;
  expect(await attempt.press(() => input)).toEqual({ kind: "conflict", message: "Changed" });
  expect(api.deletePage.mock.calls).toEqual([
    [page.id, 1],
    [page.id, 1],
  ]);
  expect(api.page.mock.calls).toEqual([[page.id], [page.id]]);
  expect(api.page.mock.invocationCallOrder[1]).toBeLessThan(
    api.deletePage.mock.invocationCallOrder[1]!,
  );
});

test.each([
  [new ApiFailure(403, [], "Editors only"), { kind: "forbidden", message: "Editors only" }],
  [
    new ApiFailure(409, [], "Page has children", "has_children"),
    { kind: "refused", code: "page_dialog_conflict", message: "Page has children" },
  ],
  [new ApiFailure(409), { kind: "refused", code: "page_dialog_conflict" }],
  [new ApiFailure(422, errors), { kind: "invalid", errors }],
  [new ApiFailure(400, errors), { kind: "invalid", errors }],
])("page dialog catalogue preserves refusal presentation: %s", async (failure, outcome) => {
  const api = fakeApi();
  api.createPage.mockRejectedValue(failure);
  api.deletePage.mockRejectedValue(failure);
  expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual(outcome);
  expect(
    await writeAttempt(writes.deletePage(api)).press(() => ({ id: page.id, version: 1 })),
  ).toEqual(outcome);
  expect(api.page).not.toHaveBeenCalled();
});

test.each([
  "parent_id",
  "category_id",
  "frontmatter",
  "visibility",
  "title",
  "body_markdown",
] as const)(
  "real-client create recovery rejects missing confirmation evidence: %s",
  async (field) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") return new Response(null, { status: 503 });

      if (String(url).endsWith("/services")) return Response.json([newService]);

      return Response.json({ ...newPage, [field]: undefined });
    });

    try {
      const api = createEditorApi("https://content.test");
      expect(await writeAttempt(writes.createPage(api)).press(() => newPageInput)).toEqual({
        kind: "unknown",
      });
      expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    } finally {
      fetch.mockRestore();
    }
  },
);

test("real-client deletion recovery does not mistake a malformed 200 for absence", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 503 })
        : Response.json({ id: page.id }),
    );

  try {
    const api = createEditorApi("https://content.test");
    expect(
      await writeAttempt(writes.deletePage(api)).press(() => ({ id: page.id, version: 1 })),
    ).toEqual({ kind: "unknown" });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  } finally {
    fetch.mockRestore();
  }
});

const restoreRequest: PageRestoreRequest = {
  pageId: "page",
  versionNo: 2,
  read: 17,
  historyVersion: 9,
  isPublic: false,
};

const restoreEvent: PageHistoryEntry = {
  version_no: 10,
  action: "reverted",
  restored_from: 2,
  actor: "editor",
  actor_name: "Editor",
  occurred_at: page.updated_at,
  changed: ["title"],
  comment: null,
};

test("an answered restore sends the selected history and page versions without reading back", async () => {
  const api = fakeApi();
  api.restoreVersion.mockResolvedValue(page);
  expect(await writeAttempt(writes.restoreVersion(api)).press(() => restoreRequest)).toEqual({
    kind: "landed",
    answer: page,
  });
  expect(api.restoreVersion).toHaveBeenCalledExactlyOnceWith("page", 2, 17);
  expect(api.history).not.toHaveBeenCalled();
});

test("a lost non-public restore is confirmed by a newer event for the requested version", async () => {
  const api = fakeApi();
  api.restoreVersion.mockRejectedValue(new ApiFailure(0));
  api.history.mockResolvedValue([restoreEvent]);
  expect(await writeAttempt(writes.restoreVersion(api)).press(() => restoreRequest)).toEqual({
    kind: "landed",
    answer: [restoreEvent],
  });
  expect(api.history).toHaveBeenCalledExactlyOnceWith("page");
  expect(api.restoreVersion).toHaveBeenCalledTimes(1);
  expect(api.page).not.toHaveBeenCalled();
});

test.each([
  ["another action", { ...restoreEvent, action: "updated" as const }],
  ["another source", { ...restoreEvent, restored_from: 1 }],
  ["no source", { ...restoreEvent, restored_from: null }],
  ["an already displayed event", { ...restoreEvent, version_no: 9 }],
  ["an older event", { ...restoreEvent, version_no: 8 }],
])("restore does not accept %s as evidence", async (_reason, event) => {
  const api = fakeApi();
  api.restoreVersion.mockRejectedValue(new ApiFailure(0));
  api.history.mockResolvedValue([event]);
  expect(await writeAttempt(writes.restoreVersion(api)).press(() => restoreRequest)).toEqual({
    kind: "unknown",
  });
  expect(api.restoreVersion).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  "a lost no-op restore stays unconfirmed (public: %s)",
  async (isPublic) => {
    const api = fakeApi();
    api.restoreVersion.mockRejectedValue(new ApiFailure(503));
    api.history.mockResolvedValue([]);
    expect(
      await writeAttempt(writes.restoreVersion(api)).press(() => ({ ...restoreRequest, isPublic })),
    ).toEqual({ kind: "unknown" });
    expect(api.restoreVersion).toHaveBeenCalledTimes(1);
  },
);

test("a public restore cannot claim a later live restore as its own confirmation", async () => {
  const api = fakeApi();
  api.restoreVersion.mockRejectedValue(new ApiFailure(0));
  api.history.mockResolvedValue([restoreEvent]);
  api.page.mockResolvedValue({
    ...page,
    version: 99,
    pending_revision: { status: "submitted", comment: null },
  });
  expect(
    await writeAttempt(writes.restoreVersion(api)).press(() => ({
      ...restoreRequest,
      isPublic: true,
    })),
  ).toEqual({ kind: "unknown" });
});

test.each([new ApiFailure(0), new ApiFailure(503), new ApiFailure(404), new ApiAnswerMalformed()])(
  "a failed history read cannot confirm restore: %s",
  async (failure) => {
    const api = fakeApi();
    api.restoreVersion.mockRejectedValue(new ApiFailure(0));
    api.history.mockRejectedValue(failure);
    expect(await writeAttempt(writes.restoreVersion(api)).press(() => restoreRequest)).toEqual({
      kind: "unknown",
    });
    expect(api.history).toHaveBeenCalledTimes(1);
    expect(api.restoreVersion).toHaveBeenCalledTimes(1);
  },
);

test("a restore retry checks first and keeps the original identity, both versions and history boundary", async () => {
  const api = fakeApi();
  api.restoreVersion
    .mockRejectedValueOnce(new ApiFailure(503))
    .mockRejectedValueOnce(new ApiFailure(409, [], "Changed", "version_conflict"));
  api.history.mockResolvedValue([]);
  const request = { ...restoreRequest };
  const attempt = writeAttempt(writes.restoreVersion(api));
  await attempt.press(() => request);
  request.pageId = "other";
  request.versionNo = 5;
  request.read = 99;
  request.historyVersion = 100;
  api.history.mockResolvedValue([{ ...restoreEvent, restored_from: 5 }]);
  const next = vi.fn(() => request);
  expect(await attempt.press(next)).toEqual({ kind: "conflict", message: "Changed" });
  expect(next).not.toHaveBeenCalled();
  expect(api.restoreVersion.mock.calls).toEqual([
    ["page", 2, 17],
    ["page", 2, 17],
  ]);
  expect(api.history.mock.calls).toEqual([["page"], ["page"]]);
  expect(api.history.mock.invocationCallOrder[1]).toBeLessThan(
    api.restoreVersion.mock.invocationCallOrder[1]!,
  );
});

test("a later matching restore read confirms against the frozen history boundary without resending", async () => {
  const api = fakeApi();
  api.restoreVersion.mockRejectedValue(new ApiFailure(0));
  api.history.mockResolvedValueOnce([]).mockResolvedValue([restoreEvent]);
  const request = { ...restoreRequest };
  const attempt = writeAttempt(writes.restoreVersion(api));
  await attempt.press(() => request);
  request.historyVersion = 100;
  const next = vi.fn(() => request);
  expect((await attempt.press(next)).kind).toBe("landed");
  expect(next).not.toHaveBeenCalled();
  expect(api.restoreVersion).toHaveBeenCalledTimes(1);
});

test.each([
  [
    new ApiFailure(409, [], "Gone", "not_restorable"),
    { kind: "refused", code: "restore_conflict", message: "Gone" },
  ],
  [new ApiFailure(409), { kind: "refused", code: "restore_conflict" }],
  [
    new ApiFailure(409, [], "Changed", "version_conflict"),
    { kind: "conflict", message: "Changed" },
  ],
  [new ApiFailure(403, [], "Editors only"), { kind: "forbidden", message: "Editors only" }],
  [new ApiFailure(422, errors, "Invalid"), { kind: "invalid", errors, message: "Invalid" }],
])(
  "restore retains refusal messages and identifies every answered 409: %s",
  async (failure, expected) => {
    const api = fakeApi();
    api.restoreVersion.mockRejectedValue(failure);
    expect(await writeAttempt(writes.restoreVersion(api)).press(() => restoreRequest)).toEqual(
      expected,
    );
    expect(api.history).not.toHaveBeenCalled();
  },
);

test("real-client restore recovery rejects a coercible history version instead of confirming it", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? new Response(null, { status: 503 })
        : Response.json({ entries: [{ ...restoreEvent, version_no: "10" }] }),
    );

  try {
    expect(
      await writeAttempt(writes.restoreVersion(createEditorApi("https://content.test"))).press(
        () => restoreRequest,
      ),
    ).toEqual({ kind: "unknown" });
  } finally {
    fetch.mockRestore();
  }
});
