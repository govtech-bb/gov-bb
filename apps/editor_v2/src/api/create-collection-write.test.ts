import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiFailure, createEditorApi, type Collection, type NewCollectionInput } from "./client";
import { writes } from "./writes";

const FIELDS: Collection["schema"]["fields"] = [
  { key: "key", label: "Key", type: "slug" },
  { key: "name", label: "Name", type: "text" },
];

const SENT: NewCollectionInput = {
  key: "offices",
  title: "Offices",
  record_key: "key",
  schema: { fields: FIELDS },
};

const STORED: Collection = {
  ...SENT,
  schema: { fields: FIELDS },
  schema_version: 1,
  updated_at: "2026-11-19T12:01:00.000Z",
};

/** The create's lost-answer check, over api_v2 answering every read with `answer`. */
function createCollection(answer: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => answer()),
  );

  return writes.createCollection(createEditorApi("https://api.example.test"));
}

afterEach(() => vi.unstubAllGlobals());

describe("reading a created collection back", () => {
  test("finds the collection api_v2 holds under the sent key", async () => {
    const write = createCollection(() => Response.json({ collection: STORED, records: [] }));

    await expect(write.readBack(SENT)).resolves.toEqual(STORED);
  });

  test("finds nothing when api_v2 has no collection by that key", async () => {
    const write = createCollection(() => Response.json({ error: "not_found" }, { status: 404 }));

    await expect(write.readBack(SENT)).resolves.toBeUndefined();
  });

  test("can't tell when the read fails, so it settles nothing", async () => {
    const write = createCollection(() =>
      Response.json({ error: "internal_error" }, { status: 500 }),
    );

    await expect(write.readBack(SENT)).rejects.toBeInstanceOf(ApiFailure);
  });
});

describe("whether the lost create landed", () => {
  const landed = createCollection(() => Response.json({})).landed;

  test("it did when api_v2 holds exactly this definition", () => {
    expect(landed(STORED, SENT)).toBe(true);
  });

  test("it didn't when api_v2 holds nothing by that key", () => {
    expect(landed(undefined, SENT)).toBe(false);
  });

  const [key, name] = FIELDS;

  const changes: [string, Partial<Collection>][] = [
    ["another title", { title: "Branch offices" }],
    ["another record key", { record_key: "name" }],
    ["a field with another label", { schema: { fields: [key!, { ...name!, label: "Office" }] } }],
    ["a field with another type", { schema: { fields: [key!, { ...name!, type: "email" }] } }],
    ["another field order", { schema: { fields: [name!, key!] } }],
    ["a field fewer", { schema: { fields: [key!] } }],
    [
      "a field more",
      { schema: { fields: [key!, name!, { key: "email", label: "Email", type: "email" }] } },
    ],
  ];

  test.each(changes)(
    "it didn't when api_v2's collection by that key has %s: someone else's",
    (_, change) => {
      expect(landed({ ...STORED, ...change }, SENT)).toBe(false);
    },
  );
});
