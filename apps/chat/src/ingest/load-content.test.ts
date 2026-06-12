import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContent } from "@govtech-bb/content";
import { chunkService } from "./chunker";

// The loader must see everything the landing site serves (#1266): nested
// category trees, dirs without index.md, and start.md sub-pages — plus carry
// form_id and visibility through to ingest (#1265 / #1267). Fixtures mirror
// the real content-tree shapes (post-office folder, youth-and-community
// nesting, ministry-of-youth orphan dir, top-level .md files).

async function fixtureTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "content-fixture-"));

  // Top-level .md file (the original loader's bread and butter).
  await writeFile(
    join(root, "apply-for-terms-leave.md"),
    `---
title: "Apply for terms leave"
category: work-employment
form_id: term-leave-application
---

Body text.
`,
  );

  // Service folder with index.md + start.md (post-office shape).
  const svc = join(root, "post-office-redirection-individual");
  await mkdir(svc);
  await writeFile(
    join(svc, "index.md"),
    `---
title: "Redirect my personal mail"
category: travel-id-citizenship
form_id: post-office-redirection-individual
---

Main body.

## Who can use this service

Adults.
`,
  );
  await writeFile(
    join(svc, "start.md"),
    `---
title: "Redirect my personal mail"
form_id: post-office-redirection-individual
---

Complete it in one go.

## What you will need

* the old address

<a data-start-link>Start now</a>
`,
  );

  // Nested category tree with no index.md anywhere (youth-and-community shape).
  const nested = join(root, "youth-and-community", "arts-culture");
  await mkdir(nested, { recursive: true });
  await writeFile(
    join(nested, "community-canvas.md"),
    `---
title: "Community Canvas"
category: youth-and-community
form_id: youth-opportunity-community-canvas
visibility: public
---

Paint things.
`,
  );

  // Dir without index.md holding a preview service (ministry-of-youth shape).
  const orphan = join(root, "ministry-of-youth");
  await mkdir(orphan);
  await writeFile(
    join(orphan, "camp-director-application.md"),
    `---
title: "Apply to be a Camp Director"
category: youth-and-community
form_id: camp-director-application
visibility: preview
---

Camp things.
`,
  );

  // Empty-string form_id (most info-only pages) must normalise to undefined.
  await writeFile(
    join(root, "no-form-service.md"),
    `---
title: "Info only"
form_id: ""
---

Just info.
`,
  );

  return root;
}

test("loader covers nested trees, orphan dirs, start.md, form_id, visibility", async () => {
  const root = await fixtureTree();
  try {
    const { services, warnings } = await loadContent({ contentDir: root });
    assert.equal(warnings.length, 0, warnings.join("; "));
    const bySlug = new Map(services.map((s) => [s.slug, s]));

    // Top-level slugs unchanged from the old loader → doc ids stay stable.
    assert.ok(bySlug.has("apply-for-terms-leave"));
    assert.ok(bySlug.has("post-office-redirection-individual"));

    // Nested + orphan-dir services load with path slugs (canonical URL shape).
    const nested = bySlug.get(
      "youth-and-community/arts-culture/community-canvas",
    );
    assert.ok(nested, "nested category service missing");
    const preview = bySlug.get("ministry-of-youth/camp-director-application");
    assert.ok(preview, "orphan-dir service missing");

    // start.md folds into the parent under a synthetic heading, start-link gone.
    const po = bySlug.get("post-office-redirection-individual")!;
    assert.match(po.body, /## Before you start/);
    assert.match(po.body, /## What you will need/);
    assert.doesNotMatch(po.body, /data-start-link/);

    // form_id carried; "" normalised away; visibility defaulted/parsed.
    assert.equal(po.form_id, "post-office-redirection-individual");
    assert.equal(nested.form_id, "youth-opportunity-community-canvas");
    assert.equal(bySlug.get("no-form-service")?.form_id, undefined);
    assert.equal(po.visibility, "public");
    assert.equal(preview.visibility, "preview");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chunker carries status + formId into document metadata", async () => {
  const root = await fixtureTree();
  try {
    const { services } = await loadContent({ contentDir: root });
    const bySlug = new Map(services.map((s) => [s.slug, s]));

    const po = chunkService(bySlug.get("post-office-redirection-individual")!);
    assert.equal(po.document.metadata.status, "public");
    assert.equal(
      po.document.metadata.formId,
      "post-office-redirection-individual",
    );
    // The folded start content becomes retrievable section chunks.
    assert.ok(
      po.chunks.some((c) => c.kind === "section" && /old address/.test(c.text)),
      "start.md content missing from chunks",
    );

    const preview = chunkService(
      bySlug.get("ministry-of-youth/camp-director-application")!,
    );
    assert.equal(preview.document.metadata.status, "preview");

    // No form → no formId key at all (retrieval treats absence as "no form").
    const info = chunkService(bySlug.get("no-form-service")!);
    assert.equal("formId" in info.document.metadata, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
