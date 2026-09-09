import { describe, expect, it } from "vitest";
import {
  arrayField,
  objectField,
  prepareContentChange,
  contentSchema,
  fieldDefault,
  withContentFields,
  textField,
  type SmartToolDefinition,
} from "./smart-tool-fields";
import { smartTool } from "./smart-tools";

const definition: SmartToolDefinition = {
  id: "directory",
  kind: "locator",
  title: "Directory",
  url: "/directory",
  category: "health",
  views: [],
  fields: {
    records: arrayField(
      "Records",
      objectField("Record", {
        id: textField("Identifier"),
        name: textField("Name"),
        hours: { label: "Opening hours", type: "hours", optional: true },
      }),
      { identity: "id" },
    ),
  },
};
const base = {
  schemaVersion: 1,
  systemFlag: true,
  records: [
    {
      id: "a",
      name: "First",
      hours: [{ opens: "09:00", closes: "17:00" }],
      provenance: "original source",
    },
    { id: "b", name: "Second" },
  ],
};

describe("registered content changes", () => {
  it("updates a field while preserving other records and unauthored data", () => {
    const draft = {
      schemaVersion: 1,
      records: [
        { id: "a", name: "Renamed" },
        { id: "b", name: "Second" },
      ],
    };
    const result = prepareContentChange(definition, base, draft);
    expect(result.content).toEqual({
      ...base,
      records: [{ ...base.records[0], name: "Renamed" }, base.records[1]],
    });
    expect(result.changes).toEqual([
      {
        path: "/records/a/name",
        label: "Records › First › Name",
        before: "First",
        after: "Renamed",
      },
    ]);
  });
  it("requires explicit removal and rejects stale removal claims", () => {
    const draft = { ...base, records: [base.records[1]] };
    expect(prepareContentChange(definition, base, draft).content).toEqual(base);
    expect(
      prepareContentChange(definition, base, draft, ["/records/a"]).content
        .records,
    ).toEqual([base.records[1]]);
    expect(() =>
      prepareContentChange(definition, base, base, ["/records/a"]),
    ).toThrow("no longer matches");
  });
  it("keeps unknown, closed and 24-hour schedules distinct", () => {
    const unknown = {
      ...base,
      records: [{ ...base.records[0], hours: null }, base.records[1]],
    };
    expect(
      (
        prepareContentChange(definition, base, unknown).content
          .records as object[]
      )[0],
    ).not.toHaveProperty("hours");
    for (const hours of [[], [{ opens: "00:00", closes: "24:00" }]]) {
      const draft = {
        ...base,
        records: [{ ...base.records[0], hours }, base.records[1]],
      };
      expect(
        (
          prepareContentChange(definition, base, draft).content.records as {
            hours: unknown;
          }[]
        )[0].hours,
      ).toEqual(hours);
    }
  });
  it("rejects overlapping schedules and duplicate identifiers", () => {
    const draft = {
      ...base,
      records: [
        {
          ...base.records[0],
          hours: [
            { opens: "09:00", closes: "17:00" },
            { opens: "16:00", closes: "18:00" },
          ],
        },
        base.records[1],
      ],
    };
    expect(() => prepareContentChange(definition, base, draft)).toThrow(
      "must not overlap",
    );
    expect(() =>
      prepareContentChange(definition, base, {
        ...base,
        records: [base.records[0], base.records[0], base.records[1]],
      }),
    ).toThrow("unique identifier");
  });
  it("allows additions but keeps protected collections fixed", () => {
    const draft = {
      ...base,
      records: [...base.records, { id: "c", name: "Third" }],
    };
    expect(
      (
        prepareContentChange(definition, base, draft).content
          .records as unknown[]
      ).length,
    ).toBe(3);
    const fixed = {
      ...definition,
      fields: { records: { ...definition.fields.records, fixed: true } },
    };
    expect(() => prepareContentChange(fixed, base, draft)).toThrow(
      "new records",
    );
  });
  it("rejects unsupported versions and changes to protected fields", () => {
    expect(() =>
      prepareContentChange(definition, base, { ...base, schemaVersion: 2 }),
    ).toThrow("version");
    const protectedDefinition = {
      ...definition,
      fields: {
        ...definition.fields,
        systemFlag: {
          label: "Release gate",
          type: "boolean" as const,
          readonly: true,
        },
      },
    };
    expect(() =>
      prepareContentChange(protectedDefinition, base, {
        ...base,
        systemFlag: false,
      }),
    ).toThrow("cannot be changed");
  });
});

it("requires explicit factual values and preserves dynamic wording tokens", () => {
  const pharmacy = smartTool("pharmacies").fields.pharmacies.item!;
  const record = fieldDefault(pharmacy) as Record<string, unknown>;
  expect(record.hours).toBeUndefined();
  expect(record.coords).toBeUndefined();
  expect(record.pppStatus).toBe("");
  expect(fieldDefault({ ...pharmacy.fields!.coords, optional: false })).toEqual(
    { lat: null, lon: null },
  );
  const content = {
    schemaVersion: 1,
    records: [],
    copy: { total: "Found {count} records", unit: "/ month" },
  };
  const fields = withContentFields(definition, content);
  expect(contentSchema(fields).safeParse(content).success).toBe(true);
  expect(() =>
    prepareContentChange(fields, content, {
      ...content,
      copy: { total: "Found records" },
    }),
  ).toThrow("Keep {count}");
});

it("requires an updated source when a verified pharmacy fact changes", () => {
  const source = {
    id: "source-1",
    fields: ["contacts"],
    source: "Directory",
    checkedOn: "2026-08-01",
  };
  const pharmacy = {
    slug: "example",
    name: "Example",
    type: "private",
    pppStatus: "unconfirmed",
    parish: "St. Michael",
    phone: "1111111",
    verification: [source],
  };
  const content = {
    schemaVersion: 1,
    lastUpdated: "2026-08-01",
    copy: {},
    pharmacies: [pharmacy],
  };
  const draft = { ...content, pharmacies: [{ ...pharmacy, phone: "2222222" }] };
  const fields = smartTool("pharmacies");
  expect(() => prepareContentChange(fields, content, draft)).toThrow(
    "Update the source",
  );
  const updated = {
    ...draft,
    pharmacies: [
      {
        ...draft.pharmacies[0],
        verification: [{ ...source, checkedOn: "2026-09-09" }],
      },
    ],
  };
  expect(prepareContentChange(fields, content, updated).content).toEqual(
    updated,
  );
  const removed = {
    ...draft,
    pharmacies: [{ ...draft.pharmacies[0], verification: [] }],
  };
  expect(
    prepareContentChange(fields, content, removed, [
      "/pharmacies/example/verification/source-1",
    ]).content,
  ).toEqual(removed);
  expect(() =>
    prepareContentChange(fields, content, {
      ...content,
      pharmacies: [{ ...pharmacy, slug: "bad/address" }],
    }),
  ).toThrow("hyphens");
});
