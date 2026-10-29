import { expect, test } from "vitest";
import type { Collection } from "../../src/api/client";
import {
  droppedFields,
  keyProblem,
  recordData,
  recordValues,
  valuesDiffer,
  withRecord,
} from "../../src/workspace/collections/records";

const collection: Collection = {
  key: "contacts",
  title: "Contacts",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Telephone", type: "text" },
    ],
  },
  schema_version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

const record = {
  record_key: "nis",
  data: { key: "nis", name: "NIS", phone: "431-7400", fax: "431-0000" },
  updated_at: "2026-10-26T12:00:00.000Z",
};

test("a record's dialog opens with its values and its key", () => {
  expect(recordValues(collection)).toEqual({});
  expect(recordValues({ ...collection, record_key: "id" }, record)).toEqual({
    ...record.data,
    id: "nis",
  });
});

test("saving sends trimmed values, leaving out blanks and fields the collection no longer lists", () => {
  expect(recordData(collection, { ...record.data, name: " NIS  ", phone: "  " })).toEqual({
    key: "nis",
    name: "NIS",
  });
  expect(droppedFields(collection, record)).toEqual(["fax"]);
  expect(droppedFields(collection)).toEqual([]);
  expect(recordData(collection, { key: "new", name: "New" })).toEqual({ key: "new", name: "New" });
});

test("a new record's key must be api_v2's shape", () => {
  expect(keyProblem("")).toBe("Enter a key");
  expect(keyProblem("a".repeat(201))).toBe("Keep the key to 200 characters or fewer");
  expect(keyProblem("Bad key")).toBe(
    "Use only lower-case letters, numbers and single hyphens between words",
  );
  expect(keyProblem("a--b")).toBeDefined();
  expect(keyProblem("barbados-drug-service")).toBeUndefined();
});

test("values differ from a record only in a listed field, ignoring surrounding spaces", () => {
  expect(valuesDiffer(collection, recordValues(collection, record), record)).toBe(false);
  expect(valuesDiffer(collection, { ...record.data, name: " NIS " }, record)).toBe(false);
  expect(valuesDiffer(collection, { ...record.data, name: "Other" }, record)).toBe(true);
  expect(valuesDiffer(collection, { ...record.data, phone: "" }, record)).toBe(true);
});

test("a saved record takes its place in record key order", () => {
  const a = { ...record, record_key: "a" };
  const c = { ...record, record_key: "c" };
  const b = { ...record, record_key: "b" };

  expect(withRecord([a, c], b).map((item) => item.record_key)).toEqual(["a", "b", "c"]);
  expect(withRecord([a, b, c], { ...b, updated_at: "later" })[1]?.updated_at).toBe("later");
});
