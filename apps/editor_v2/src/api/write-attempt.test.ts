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
  type RecordDetail,
} from "./client";
import { writeAttempt } from "./write-attempt";
import { writes, type RecordWrite } from "./writes";

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
    record: vi.fn<EditorApi["record"]>().mockResolvedValue(base),
    saveRecord: vi.fn<EditorApi["saveRecord"]>().mockResolvedValue(saved),
    createRecord: vi.fn<EditorApi["createRecord"]>().mockResolvedValue(saved.record),
    deleteRecord: vi.fn<EditorApi["deleteRecord"]>().mockResolvedValue(undefined),
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
  [new ApiFailure(400, errors, "Invalid", "validation_failed"), { kind: "invalid", errors }],
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

  expect(await attempt.press(() => undefined)).toEqual({ kind: "invalid", errors });
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
  [new CategoryNotFound("Gone"), { kind: "missing" }],
  [new CategoryAccessDenied(401, "Sign in"), { kind: "signed-out" }],
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
