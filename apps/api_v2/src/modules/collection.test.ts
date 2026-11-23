/**
 * A record's values against its collection's field types (#3782): each type
 * keeps its own kind of value, and a wrong one is refused naming its field.
 */

import { describe, expect, it } from "vitest";
import {
  LIST_ITEM_MAX,
  LIST_MAX_ITEMS,
  parseRecord,
  type CollectionView,
} from "./collection";

const SHELTERS: Pick<CollectionView, "key" | "record_key" | "schema"> = {
  key: "shelters",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "has-water", label: "Has water", type: "boolean" },
      { key: "opened", label: "Opened", type: "date" },
      { key: "documents", label: "Documents", type: "list" },
    ],
  },
};

const parse = (data: Record<string, unknown>) =>
  parseRecord(SHELTERS, "st-judes", data);

/** The fields a refusal names, or `ok` when the record is taken. */
const refused = (data: Record<string, unknown>) => {
  const result = parse(data);
  return result.ok ? "ok" : result.error.errors.map((error) => error.field);
};

describe("a record's values, by field type", () => {
  it("keeps each type's value as that type", () => {
    const result = parse({
      name: "St. Jude's Primary",
      capacity: 0.1725,
      "has-water": false,
      opened: "2024-02-29",
      documents: [" ID card ", "Proof of address"],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        key: "st-judes",
        name: "St. Jude's Primary",
        capacity: 0.1725,
        "has-water": false,
        opened: "2024-02-29",
        documents: ["ID card", "Proof of address"],
      },
    });
  });

  it.each([
    ["text", "12"],
    ["a number as text", "0.1725"],
    ["true", true],
    ["a list", [1]],
  ])("refuses %s in a number field", (_, capacity) => {
    expect(refused({ capacity })).toEqual(["capacity"]);
  });

  it.each([
    ["the text true", "true"],
    ["a number", 1],
    ["null", null],
  ])("refuses %s in a boolean field", (_, value) => {
    expect(refused({ "has-water": value })).toEqual(["has-water"]);
  });

  it.each([
    ["a month and day that don't exist", "2026-13-40"],
    ["29 February in a common year", "2026-02-29"],
    ["31 April", "2026-04-31"],
    ["a date without leading zeros", "2026-8-1"],
    ["a date and time", "2026-08-01T00:00:00Z"],
    ["a day-first date", "01/08/2026"],
    ["a number", 20260801],
  ])("refuses %s in a date field", (_, opened) => {
    expect(refused({ opened })).toEqual(["opened"]);
  });

  it.each([
    ["text", "ID card"],
    ["an item that isn't text", ["ID card", 2]],
    ["a blank item", ["ID card", "  "]],
    ["an item over the length limit", ["x".repeat(LIST_ITEM_MAX + 1)]],
    [
      "more items than the limit",
      Array.from({ length: LIST_MAX_ITEMS + 1 }, (_, i) => `Item ${i}`),
    ],
  ])("refuses %s in a list field", (_, documents) => {
    expect(refused({ documents })).toEqual(["documents"]);
  });

  it("takes a list at its limits, and an empty list", () => {
    expect(
      refused({
        documents: Array.from({ length: LIST_MAX_ITEMS }, () =>
          "x".repeat(LIST_ITEM_MAX),
        ),
      }),
    ).toBe("ok");
    expect(refused({ documents: [] })).toBe("ok");
  });

  it("refuses a value of another type in a text field", () => {
    expect(refused({ name: 42 })).toEqual(["name"]);
    expect(refused({ name: ["St. Jude's"] })).toEqual(["name"]);
  });

  it("says what each type needs, naming the field, and refuses every wrong field at once", () => {
    const result = parse({
      capacity: "many",
      "has-water": "yes",
      opened: "2026-13-40",
      documents: ["x".repeat(LIST_ITEM_MAX + 1)],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.errors).toEqual([
      { field: "capacity", message: "Enter a number, such as 12 or 0.1725." },
      { field: "has-water", message: "Enter true or false." },
      {
        field: "opened",
        message: "Enter a real date as YYYY-MM-DD, such as 2026-08-01.",
      },
      {
        field: "documents",
        message: `Enter a list of up to ${LIST_MAX_ITEMS} items, each with some text, up to ${LIST_ITEM_MAX} characters.`,
      },
    ]);
  });
});
