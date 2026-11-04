import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CategoryOrderBody } from "./category";
import {
  EditVersion,
  ExpectedVersionQuery,
  VersionCommandBody,
  expectedVersionFields,
  expectedCollectionVersionFields,
} from "./edit-concurrency";

const versionBody = z.object({
  ...expectedVersionFields,
  ...expectedCollectionVersionFields,
});
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("write preconditions", () => {
  it("requires body, query and command versions", () => {
    for (const body of [undefined, null, {}, [], { expected_version: null }])
      expect(VersionCommandBody.safeParse(body).success).toBe(false);
    expect(versionBody.safeParse({}).success).toBe(false);
    expect(ExpectedVersionQuery.safeParse({}).success).toBe(false);
  });

  it.each(["1", "9007199254740991"])(
    "parses the canonical query boundary %s",
    (expected_version) => {
      expect(ExpectedVersionQuery.parse({ expected_version })).toEqual({
        expected_version: Number(expected_version),
      });
    },
  );

  it.each([
    "",
    "0",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e3",
    " 1",
    "1 ",
    "9007199254740992",
    "10000000000000000",
    ["1", "2"],
    null,
    1,
  ])("rejects malformed query precondition %s", (expected_version) => {
    expect(ExpectedVersionQuery.safeParse({ expected_version }).success).toBe(
      false,
    );
  });

  it.each([0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed record/body preconditions %s",
    (version) => {
      expect(versionBody.safeParse({ expected_version: version }).success).toBe(
        false,
      );
      expect(
        versionBody.safeParse({ expected_collection_version: version }).success,
      ).toBe(false);
    },
  );

  it("requires a complete versioned reorder baseline", () => {
    expect(
      CategoryOrderBody.safeParse({ parent_id: null, ordered_ids: [A] })
        .success,
    ).toBe(false);
    expect(
      CategoryOrderBody.safeParse({
        parent_id: null,
        ordered_ids: [A],
        expected: [{ id: A }],
      }).success,
    ).toBe(false);
    expect(
      CategoryOrderBody.safeParse({ parent_id: null, ordered_ids: [A, A] })
        .success,
    ).toBe(false);
    for (const body of [
      {
        ordered_ids: [A, B],
        expected: [
          { id: A, version: 1 },
          { id: A, version: 2 },
        ],
      },
      {
        ordered_ids: [A, A],
        expected: [
          { id: A, version: 1 },
          { id: B, version: 2 },
        ],
      },
      { ordered_ids: [A], expected: [{ id: B, version: 2 }] },
      { ordered_ids: [A], expected: [{ id: A, version: "1" }] },
    ])
      expect(
        CategoryOrderBody.safeParse({ parent_id: null, ...body }).success,
      ).toBe(false);
    expect(
      CategoryOrderBody.safeParse({
        parent_id: null,
        ordered_ids: [B, A],
        expected: [
          { id: A, version: 1 },
          { id: B, version: 2 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("EditVersion", () => {
  it.each([1, Number.MAX_SAFE_INTEGER])(
    "accepts the safe integer boundary %s",
    (version) => {
      expect(EditVersion.parse(version)).toBe(version);
    },
  );

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
    "1",
    null,
    undefined,
  ])("rejects a non-identity %s", (version) => {
    expect(EditVersion.safeParse(version).success).toBe(false);
  });
});
