/**
 * The severance start page: all prose, no configuration.
 *
 * The round trip is the thing under test, and it matters more now than it
 * did when these were written against a plain form surface. The canonical
 * document is our `{version, blocks, refs}`; BlockNote's own block shape is
 * not (ADR 0074). Everything here is really testing one adapter, in both
 * directions, and a block editor that quietly rewrites an em dash, drops a
 * bold run or renumbers an anchor is not a content model — it is a lossy
 * import, and the damage is invisible until someone diffs two years of
 * content.
 */

import { expect, test } from "@playwright/test";
import {
  DOC,
  SEVERANCE_URL,
  block,
  blockIds,
  bodyJson,
  deleteBlock,
  editorSurface,
  gotoSite,
  insertBlockAfter,
  moveBlockUp,
  openDocument,
  preview,
  replaceText,
  saveAndExpectSuccess,
  saveStatus,
} from "./support";

test.describe("round trip", () => {
  test("saving with no edits leaves the body byte-identical", async ({
    page,
  }) => {
    // Loading the document into BlockNote and serializing it back out must
    // be a no-op. If the adapter injects BlockNote's default props —
    // textColor, backgroundColor, textAlignment — this is where it shows.
    await openDocument(page, DOC.severance);

    const before = await bodyJson(page);
    await saveAndExpectSuccess(page);
    const after = await bodyJson(page);

    expect(after).toBe(before);
  });

  test("a second save after a reload is still byte-identical", async ({
    page,
  }) => {
    // Catches a normalisation that is stable but wrong — one that mangles
    // the document once and then agrees with itself forever after.
    await openDocument(page, DOC.severance);
    const original = await bodyJson(page);
    await saveAndExpectSuccess(page);

    await page.reload();
    await expect(editorSurface(page)).toBeVisible();
    await saveAndExpectSuccess(page);

    expect(await bodyJson(page)).toBe(original);
  });

  test("bold, the em dash and list structure survive an edit elsewhere", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);

    // Touch one unrelated paragraph, then check the canaries are intact.
    await replaceText(page, "b_sv04", "About 4 minutes.");
    await saveAndExpectSuccess(page);
    await page.reload();
    await expect(editorSurface(page)).toBeVisible();

    const body = await bodyJson(page);

    // The em dash, not a hyphen and not an HTML entity.
    expect(body).toContain(
      "gross pay (weekly or monthly) — include overtime or bonuses",
    );
    // The bold run is still its own span carrying the mark.
    expect(JSON.parse(body)).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          id: "b_sv02",
          content: expect.arrayContaining([
            { text: "estimate", marks: ["strong"] },
          ]),
        }),
        expect.objectContaining({
          id: "b_sv07",
          type: "list",
          ordered: false,
          items: expect.arrayContaining([
            expect.objectContaining({ id: "b_sv07c" }),
          ]),
        }),
      ]),
    });
    expect(body).toContain("About 4 minutes.");
  });

  test("typing an em dash and bold through the editor round-trips too", async ({
    page,
  }) => {
    // The seeded document proves the adapter reads correctly. This proves it
    // writes correctly, which is the direction that actually loses data.
    await openDocument(page, DOC.severance);

    await replaceText(page, "b_sv04", "Roughly 3 minutes — maybe 4.");
    await block(page, "b_sv04").click({ clickCount: 3 });
    await page.keyboard.press("ControlOrMeta+b");
    await saveAndExpectSuccess(page);

    await page.reload();
    await expect(editorSurface(page)).toBeVisible();

    const sv04 = JSON.parse(await bodyJson(page)).blocks.find(
      (b: { id: string }) => b.id === "b_sv04",
    );
    expect(sv04.content).toEqual([
      { text: "Roughly 3 minutes — maybe 4.", marks: ["strong"] },
    ]);
  });

  test("block ids are never reassigned by an edit", async ({ page }) => {
    // Ids are what future diffing, commenting and per-block approval anchor
    // to. A renumber on save would invalidate all of it silently.
    await openDocument(page, DOC.severance);
    const before = await blockIds(page);

    await replaceText(
      page,
      "b_sv01",
      "You should complete the calculator in one sitting.",
    );
    await saveAndExpectSuccess(page);

    expect(await blockIds(page)).toEqual(before);
  });

  test("an inserted block gets an id that is new and stable", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    const before = await blockIds(page);

    await insertBlockAfter(page, "b_sv01", "paragraph");
    await page.keyboard.type("One more thing.");
    await saveAndExpectSuccess(page);

    const after = await blockIds(page);
    const added = after.filter((id) => !before.includes(id));
    expect(added).toHaveLength(1);

    await page.reload();
    await expect(editorSurface(page)).toBeVisible();
    expect(await blockIds(page)).toEqual(after);
  });
});

test.describe("editing prose", () => {
  test("a heading edit reaches the preview but leaves its anchor alone", async ({
    page,
  }) => {
    // The anchor is a URL fragment. Someone has linked to it. Retyping the
    // heading text must not silently break that link.
    await openDocument(page, DOC.severance);

    await replaceText(page, "b_sv05", "What you need to have ready");

    await expect(
      preview(page).getByRole("heading", {
        name: "What you need to have ready",
      }),
    ).toBeVisible();

    await saveAndExpectSuccess(page);
    expect(JSON.parse(await bodyJson(page)).blocks).toContainEqual(
      expect.objectContaining({ id: "b_sv05", anchor: "what-you-will-need" }),
    );
  });

  test("reordering by keyboard reorders the rendered page", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);

    await moveBlockUp(page, "b_sv03");
    await saveAndExpectSuccess(page);

    const order = await blockIds(page);
    expect(order.indexOf("b_sv03")).toBeLessThan(order.indexOf("b_sv02"));

    await gotoSite(page, SEVERANCE_URL);
    const headingBox = await page
      .getByRole("heading", { name: "How long does it take?" })
      .boundingBox();
    const paragraphBox = await page
      .getByText("This tool only gives an")
      .boundingBox();
    expect(headingBox?.y ?? 0).toBeLessThan(paragraphBox?.y ?? 0);
  });

  test("reordering by dragging the block handle has the same effect", async ({
    page,
  }) => {
    // The mouse affordance, covered once. Keyboard is what the rest of the
    // suite uses, because it is the one that must not regress.
    await openDocument(page, DOC.severance);
    const before = await blockIds(page);

    await block(page, "b_sv03").hover();
    await page.getByTestId("block-handle-b_sv03").dragTo(block(page, "b_sv02"));
    await saveAndExpectSuccess(page);

    const after = await blockIds(page);
    expect(after).not.toEqual(before);
    expect(after.indexOf("b_sv03")).toBeLessThan(after.indexOf("b_sv02"));
    // A reorder must move blocks, never mint or drop them.
    expect([...after].sort()).toEqual([...before].sort());
  });

  test("deleting a block removes it from the page", async ({ page }) => {
    await openDocument(page, DOC.severance);
    await deleteBlock(page, "b_sv04");
    await saveAndExpectSuccess(page);

    await gotoSite(page, SEVERANCE_URL);
    await expect(page.getByText("About 3 minutes.")).toHaveCount(0);
  });
});

test.describe("autosave", () => {
  test("an edit saves itself without anyone pressing anything", async ({
    page,
  }) => {
    // The one test that waits for the debounce rather than forcing a flush.
    // Everywhere else uses Ctrl/Cmd+S, so that a test about facets is not
    // also a test about timing.
    await openDocument(page, DOC.severance);
    await expect(saveStatus(page)).toHaveText(/^saved$/i);

    await replaceText(page, "b_sv04", "About 6 minutes.");
    await expect(saveStatus(page)).toHaveText(/unsaved/i);

    // No flushSave() here on purpose.
    await expect(saveStatus(page)).toHaveText(/^saved$/i);

    await page.reload();
    await expect(editorSurface(page)).toBeVisible();
    expect(await bodyJson(page)).toContain("About 6 minutes.");
  });

  test("Ctrl/Cmd+S flushes immediately rather than waiting", async ({
    page,
  }) => {
    await openDocument(page, DOC.severance);
    await replaceText(page, "b_sv04", "About 8 minutes.");
    await expect(saveStatus(page)).toHaveText(/unsaved/i);

    await page.keyboard.press("ControlOrMeta+s");
    await expect(saveStatus(page)).toHaveText(/^saved$/i, { timeout: 2_000 });
  });

  test("the browser Save dialog never opens", async ({ page }) => {
    // Ctrl/Cmd+S must be intercepted. If preventDefault is missing the test
    // machine gets a native dialog and every later test in the file hangs.
    await openDocument(page, DOC.severance);
    let dialogOpened = false;
    page.on("dialog", () => {
      dialogOpened = true;
    });
    await replaceText(page, "b_sv04", "About 9 minutes.");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(saveStatus(page)).toHaveText(/^saved$/i);
    expect(dialogOpened).toBe(false);
  });
});
