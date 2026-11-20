import { expect, test } from "vitest";
import type { Collection } from "../../src/api/client";
import { valuesDiffer } from "../../src/api/record-values";
import {
  droppedFields,
  keyProblem,
  recordData,
  recordValues,
  valueText,
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

// A collection with a field of each type #3782 adds
const shelters: Collection = {
  ...collection,
  key: "shelters",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "water", label: "Has water", type: "boolean" },
      { key: "opened", label: "Opened", type: "date" },
      { key: "documents", label: "Documents", type: "list" },
    ],
  },
};

const shelter = {
  record_key: "st-judes",
  data: {
    key: "st-judes",
    capacity: 0.1725,
    water: true,
    opened: "2026-08-01",
    documents: ["ID card", "Proof of address"],
  },
  updated_at: "2026-10-26T12:00:00.000Z",
};

test("a number opens as the text of its box, and every other type as it is", () => {
  expect(recordValues(shelters, shelter)).toEqual({ ...shelter.data, capacity: "0.1725" });
});

test("saving sends each type as api_v2 keeps it", () => {
  expect(
    recordData(shelters, {
      key: "st-judes",
      capacity: " 0.1725 ",
      water: true,
      opened: "2026-08-01",
      documents: [" ID card ", "  ", "Proof of address"],
    }),
  ).toEqual(shelter.data);
  // A negative number and a whole one are numbers too
  expect(recordData(shelters, { capacity: "-12" }).capacity).toBe(-12);
  expect(recordData(shelters, { capacity: "120" }).capacity).toBe(120);
});

test("saving leaves out a blank number, a blank date, an empty list and a box nobody ticked or unticked", () => {
  expect(
    recordData(shelters, { key: "st-judes", capacity: " ", opened: "", documents: [" "] }),
  ).toEqual({
    key: "st-judes",
  });
  // Unticked by the editor, or held by the record, a no is sent
  expect(recordData(shelters, { water: false })).toEqual({ water: false });
});

test("a stored number in exponent form opens and saves as the same number", () => {
  const tiny = { ...shelter, data: { ...shelter.data, capacity: 1e-7 } };
  const huge = { ...shelter, data: { ...shelter.data, capacity: 1e21 } };

  expect(recordData(shelters, recordValues(shelters, tiny)).capacity).toBe(1e-7);
  expect(recordData(shelters, recordValues(shelters, huge)).capacity).toBe(1e21);
});

test("saving sends a number it can't read as typed, for api_v2 to refuse with its own reason", () => {
  expect(recordData(shelters, { capacity: "1,000" }).capacity).toBe("1,000");
  expect(recordData(shelters, { capacity: "12 people" }).capacity).toBe("12 people");
});

test("a value shows as text: a yes or no as a word, a list's items joined", () => {
  expect(valueText(true)).toBe("Yes");
  expect(valueText(false)).toBe("No");
  expect(valueText(0.1725)).toBe("0.1725");
  expect(valueText(["ID card", "Proof of address"])).toBe("ID card, Proof of address");
  expect(valueText(undefined)).toBe("");
});

test("typed values differ from a record only when a value does", () => {
  expect(
    valuesDiffer(shelters, recordData(shelters, recordValues(shelters, shelter)), shelter),
  ).toBe(false);
  expect(
    valuesDiffer(
      shelters,
      { ...shelter.data, documents: [" ID card", "Proof of address "] },
      shelter,
    ),
  ).toBe(false);
  expect(
    valuesDiffer(
      shelters,
      { ...shelter.data, documents: ["Proof of address", "ID card"] },
      shelter,
    ),
  ).toBe(true);
  expect(valuesDiffer(shelters, { ...shelter.data, water: false }, shelter)).toBe(true);
  expect(valuesDiffer(shelters, { ...shelter.data, capacity: 0.18 }, shelter)).toBe(true);
});
