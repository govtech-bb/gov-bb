import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceEntity } from "@govtech-bb/content";
import { canonicalLandingPath, chunkService } from "./chunker.ts";

const svc = (over: Partial<ServiceEntity> = {}): ServiceEntity =>
  ({
    slug: "renew-passport",
    title: "Renew your passport",
    description: "Renew an existing Barbados passport.",
    body: "",
    filePath: "renew-passport.md",
    visibility: "public",
    ...over,
  }) as ServiceEntity;

test("produces one service document + an intent chunk + section chunks", () => {
  const { document, chunks } = chunkService(
    svc({ body: "## Eligibility\nYou must be a citizen." }),
  );
  assert.equal(document.id, "service-renew-passport");
  assert.equal(document.kind, "service");
  assert.equal(document.slug, "renew-passport");
  assert.equal(chunks[0].kind, "intent");
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(
    chunks[0].text,
    "How do I renew your passport? Renew your passport. Renew an existing Barbados passport.",
  );
  assert.equal(chunks.filter((c) => c.kind === "section").length, 1);
});

test("splits body into sections: preamble → Summary, nested headingPath", () => {
  const { chunks } = chunkService(
    svc({ body: "Intro line.\n\n## A\nalpha\n### A1\nsub\n## B\nbeta" }),
  );
  const sections = chunks.filter((c) => c.kind === "section");
  const headings = sections.map(
    (c) => (c.payload as { heading?: string }).heading,
  );
  assert.deepEqual(headings, ["Summary", "A", "A1", "B"]);
  const a1 = sections.find(
    (c) => (c.payload as { heading?: string }).heading === "A1",
  );
  assert.deepEqual((a1!.payload as { headingPath: string[] }).headingPath, [
    "A",
    "A1",
  ]);
});

test("duplicate headings get distinct chunk ids (chunkIndex disambiguation)", () => {
  const { chunks } = chunkService(
    svc({ body: "## Standard\none\n## Standard\ntwo" }),
  );
  const ids = chunks.filter((c) => c.kind === "section").map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("metadata: status mirrors visibility; formId / hasStartPage / publishDate", () => {
  const { document } = chunkService(
    svc({
      visibility: "draft",
      form_id: "PASSPORT_RENEWAL",
      hasStartPage: true,
      publish_date: new Date("2026-01-15T00:00:00.000Z") as unknown as string,
      category: "travel",
    }),
  );
  assert.equal(document.metadata.status, "draft");
  assert.equal(document.metadata.formId, "PASSPORT_RENEWAL");
  assert.equal(document.metadata.hasStartPage, true);
  assert.equal(document.metadata.publishDate, "2026-01-15");
});

test("URL derivation: canonical, alpha source_url, and external source_url", () => {
  assert.equal(
    canonicalLandingPath(svc({ category: "travel" })),
    "/travel/renew-passport",
  );
  // no source_url → canonical, no sourceUrl
  const a = chunkService(svc({ category: "travel" })).document;
  assert.equal(a.url, "https://alpha.gov.bb/travel/renew-passport");
  assert.equal(a.sourceUrl, undefined);
  // alpha source_url → used as url
  const b = chunkService(
    svc({ source_url: "https://alpha.gov.bb/p" }),
  ).document;
  assert.equal(b.url, "https://alpha.gov.bb/p");
  assert.equal(b.sourceUrl, undefined);
  // external source_url → canonical url + sourceUrl kept
  const c = chunkService(
    svc({ category: "travel", source_url: "https://other.example/p" }),
  ).document;
  assert.equal(c.url, "https://alpha.gov.bb/travel/renew-passport");
  assert.equal(c.sourceUrl, "https://other.example/p");
});

test("payloadHash is deterministic for the same entity", () => {
  const e = svc({ body: "## A\nx", category: "travel" });
  assert.equal(
    chunkService(e).document.payloadHash,
    chunkService(e).document.payloadHash,
  );
});
