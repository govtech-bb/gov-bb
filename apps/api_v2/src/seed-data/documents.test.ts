/**
 * Every seeded document is one the reader will accept — #2840.
 *
 * `landing_v2` parses each API response with `pageDocumentSchema`, and the
 * editor runs `validateDocument` before saving, so a seed row that fails
 * either is a page that 404s or cannot be re-saved. Nothing else exercises the
 * seed corpus against them, which is how the hair salon page lost its Start
 * button without a single test noticing.
 */

import {
  pageDocumentSchema,
  validateDocument,
} from "@govtech-bb/block-kit/document";
import { describe, expect, it } from "vitest";
import { COLLECTIONS, DOCUMENTS } from "./index";

const HAIR_SALON_URL = "/business-trade/apply-for-hair-salon-licence";

describe("seeded documents", () => {
  it.each(DOCUMENTS.map((d) => [d.url, d] as const))(
    "%s parses and validates",
    (_url, seed) => {
      // What landing_v2 does on every read: the API serves the row, and the
      // reader adds the envelope fields.
      const doc = pageDocumentSchema.parse({
        version: 1,
        id: `seed-${seed.slug}`,
        updated_at: "2026-01-01T00:00:00.000Z",
        ...seed,
      });

      expect(
        validateDocument(doc as never, {
          collections: COLLECTIONS,
          pageUrls: DOCUMENTS.map((d) => d.url),
        }),
      ).toEqual([]);
    },
  );

  describe("the hair salon licence page", () => {
    const blocks = () =>
      DOCUMENTS.find((d) => d.url === HAIR_SALON_URL)?.body.blocks ?? [];

    it("puts a Start button on the first way to apply", () => {
      const list = blocks().find((b) => b.type === "list" && b.ordered);

      expect(list?.type === "list" && list.items[0]?.start_link).toEqual({
        label: "Start now",
        target_kind: "form",
        target: "apply-for-hair-salon-licence",
      });
    });

    it("says there are 2 ways to apply before the list", () => {
      const all = blocks();
      const listAt = all.findIndex((b) => b.type === "list" && b.ordered);
      const before = all[listAt - 1];

      expect(
        before?.type === "paragraph" ? before.content[0]?.text : undefined,
      ).toMatch(/^There are 2 ways to apply/);
    });
  });
});
