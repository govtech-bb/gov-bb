/**
 * Validation rules 5 to 9 and the closed palette, exercised through the UI.
 *
 * These rules are the only thing standing between a JSONB field and a
 * dangling collection reference — Postgres cannot put a foreign key inside
 * `body`. So the question is not "does the validator return an error", which
 * a unit test answers; it is "does a content designer who makes this mistake
 * get stopped, and told which block is wrong".
 *
 * Autosave raises the stakes. With no Save button to withhold, a rejected
 * document must visibly stay dirty and the stored row must stay untouched,
 * or the editor silently drifts away from what the site is serving.
 */

import { expect, test } from "@playwright/test";
import {
  DOC,
  PHARMACY_URL,
  block,
  blockByType,
  bodyJson,
  editorSurface,
  gotoSite,
  insertBlockAfter,
  openBlockSettings,
  openDocument,
  openSlashMenu,
  saveAndExpectRejection,
  saveAndExpectSuccess,
} from "./support";

test.describe("a document that breaks a rule cannot be saved", () => {
  test("rule 5 — a finder naming a collection that does not exist is rejected, and the block is named", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");
    await page.getByTestId("finder-collection").fill("pharmacys");

    const summary = await saveAndExpectRejection(page);
    await expect(summary).toContainText("pharmacys");
    await expect(summary).toContainText("data_collections");

    // The failing block is identified, not just the document.
    await expect(page.getByTestId("block-error-b_ph01")).toBeVisible();
    // And the summary links to it, the GOV.UK way.
    await page.getByTestId("error-link-b_ph01").click();
    await expect(block(page, "b_ph01")).toBeFocused();
  });

  test("rule 6 — a facet key that is not a field and is not computed is rejected", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");

    await page.getByTestId("add-facet").click();
    await page.getByTestId("facet-key-new").fill("opening_time");
    await page.getByTestId("facet-name-new").fill("Opening time");
    await page.getByTestId("facet-type-new").selectOption("checkbox");
    await page.getByTestId("confirm-facet").click();

    const summary = await saveAndExpectRejection(page);
    await expect(summary).toContainText("opening_time");
    await expect(page.getByTestId("block-error-b_ph01")).toBeVisible();
  });

  test("rule 6 — the same facet is accepted once it declares what it is computed from", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");

    await page.getByTestId("add-facet").click();
    await page.getByTestId("facet-key-new").fill("opening_time");
    await page.getByTestId("facet-name-new").fill("Opening time");
    await page.getByTestId("facet-type-new").selectOption("checkbox");
    await page.getByTestId("facet-computed-from-new").fill("hours");
    await page.getByTestId("confirm-facet").click();

    await saveAndExpectSuccess(page);
  });

  test("rule 6 — a facet computed from two fields is accepted", async ({
    page,
  }) => {
    // `subsidisedOnly` in production is a predicate over `type` AND
    // `pppStatus`. The brief's single-field `computed_from` cannot express
    // the real finder — this is the test that pins the widened form.
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");

    await page.getByTestId("add-facet").click();
    await page.getByTestId("facet-key-new").fill("fullPriceOnly");
    await page.getByTestId("facet-name-new").fill("Full price only");
    await page.getByTestId("facet-type-new").selectOption("checkbox");
    await page.getByTestId("facet-computed-from-new").fill("type, pppStatus");
    await page.getByTestId("confirm-facet").click();

    await saveAndExpectSuccess(page);
  });

  test("rule 7 — result metadata naming a field the collection does not have is rejected", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");
    await page.getByTestId("result-metadata").fill("parish, type, pharmacist");

    const summary = await saveAndExpectRejection(page);
    await expect(summary).toContainText("pharmacist");
  });

  test("rule 8 — a start link pointing at a page that does not exist is rejected", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    await openBlockSettings(page, "b_sv08");
    await page
      .getByTestId("start-link-target")
      .fill("/money-financial-support/calculate-severance-pay/frm");

    const summary = await saveAndExpectRejection(page);
    await expect(summary).toContainText("content_pages");
    await expect(page.getByTestId("block-error-b_sv08")).toBeVisible();
  });

  test("rule 9 — two headings cannot share an anchor", async ({ page }) => {
    await openDocument(page, DOC.severance);
    await openBlockSettings(page, "b_sv05");
    await page.getByTestId("anchor-b_sv05").fill("how-long-does-it-take");

    const summary = await saveAndExpectRejection(page);
    await expect(summary).toContainText("how-long-does-it-take");
  });

  test("a rejected save leaves the stored document untouched", async ({
    page,
  }) => {
    // The important half of "must not save": the citizen-facing page has to
    // still be serving the last good version. With autosave there is no
    // moment where a human decides not to save, so this is the only guard.
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");
    const good = await bodyJson(page);

    await page.getByTestId("finder-collection").fill("nope");
    await saveAndExpectRejection(page);

    await page.reload();
    await expect(editorSurface(page)).toBeVisible();
    expect(await bodyJson(page)).toBe(good);

    await gotoSite(page, PHARMACY_URL);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("fixing the error clears the summary and the document saves", async ({
    page,
  }) => {
    await openDocument(page, DOC.pharmacies);
    await openBlockSettings(page, "b_ph01");
    await page.getByTestId("finder-collection").fill("nope");
    await saveAndExpectRejection(page);

    await page.getByTestId("finder-collection").fill("pharmacies");
    await saveAndExpectSuccess(page);
  });
});

test.describe("the palette", () => {
  /*
   * Ten, not nine. The brief called the palette closed and it was, until a
   * `contact` block was needed for the "Get help" sections that every service
   * page repeats by hand. Closed means "a developer ships a new type with a
   * validation rule attached", not "the number never changes" — this count is
   * asserted so that adding one stays a deliberate act.
   */
  const PALETTE = [
    "paragraph",
    "heading",
    "list",
    "notice",
    "start_link",
    "finder",
    "calendar",
    "data_table",
    "contact",
    "image_placeholder",
  ];

  test("the slash menu offers exactly the block types in the palette", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    await block(page, "b_sv01").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const menu = await openSlashMenu(page);
    await expect(menu.getByRole("option")).toHaveCount(PALETTE.length);

    // No escape hatch: the menu is the content model made visible.
    for (const forbidden of [
      "HTML",
      "Raw",
      "JSON",
      "Code",
      "Embed",
      "Script",
    ]) {
      await expect(menu.getByText(forbidden, { exact: false })).toHaveCount(0);
    }
  });

  test("the slash menu is keyboard navigable, not mouse only", async ({
    page,
  }) => {
    // A slash menu that only works with a pointer fails the Barbados
    // Service Standards. It has to be a real combobox listbox.
    await openDocument(page, DOC.severance);
    await block(page, "b_sv01").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const menu = await openSlashMenu(page);
    await expect(menu).toHaveRole("listbox");
    await expect(menu).toHaveAttribute("aria-label", /insert/i);

    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
  });

  test("typing a filter narrows the palette without widening it", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    await block(page, "b_sv01").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    const menu = await openSlashMenu(page);
    await page.keyboard.type("head");
    const options = menu.getByRole("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(/heading/i);
  });

  test("every one of them inserts and saves", async ({ page }) => {
    // image_placeholder is used by no seeded page. It is in the palette
    // precisely so the config-block pattern is shown to generalise rather
    // than being a few bespoke forms.
    await openDocument(page, DOC.severance);
    for (const type of PALETTE) {
      await insertBlockAfter(page, "b_sv01", type);
      await expect(blockByType(page, type)).toBeVisible();
    }
  });

  test("a block type outside the palette is refused even when forced into the body", async ({
    page,
  }) => {
    // The slash menu is the honest defence; this is the one behind it. A
    // hand-written body arriving from an import or an older client must not
    // be storable.
    await openDocument(page, DOC.severance);

    const rejected = await page.evaluate(async () => {
      const store = (
        window as unknown as {
          __spikeStore: {
            get: (id: string) => Promise<Record<string, unknown>>;
            save: (doc: unknown, ifUpdatedAt: string) => Promise<unknown>;
            list: () => Promise<Array<{ id: string; url: string }>>;
          };
        }
      ).__spikeStore;
      const [summary] = (await store.list()).filter((d) =>
        d.url.includes("severance"),
      );
      const doc = await store.get(summary.id);
      const body = doc.body as { blocks: unknown[] };
      body.blocks.push({ id: "b_evil", type: "raw_html", html: "<script>" });
      try {
        await store.save(doc, doc.updated_at as string);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    });

    expect(rejected).toBeTruthy();
    expect(rejected).toMatch(/raw_html|invalid|block/i);
  });

  test("pasting rich HTML does not smuggle in a tenth block type", async ({
    page,
  }) => {
    // BlockNote parses pasted HTML into blocks. Anything its parser can
    // produce that our schema does not name has to be dropped or coerced,
    // never stored.
    await openDocument(page, DOC.severance);
    await block(page, "b_sv04").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    await page.evaluate(() => {
      const html =
        "<table><tr><td>smuggled</td></tr></table><pre><code>alert(1)</code></pre>";
      const data = new DataTransfer();
      data.setData("text/html", html);
      document
        .querySelector('[contenteditable="true"]')
        ?.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
        );
    });

    await saveAndExpectSuccess(page);

    const types: string[] = JSON.parse(await bodyJson(page)).blocks.map(
      (b: { type: string }) => b.type,
    );
    const allowed = [
      "paragraph",
      "heading",
      "list",
      "notice",
      "start_link",
      "finder",
      "calendar",
      "data_table",
      "image_placeholder",
    ];
    for (const type of types) expect(allowed).toContain(type);
  });
});
