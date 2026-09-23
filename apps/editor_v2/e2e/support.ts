/**
 * Shared vocabulary for the behavioural suite.
 *
 * This file is the UI contract. The editor and the site are built to the
 * selectors named here, not the other way round — if a helper below has to
 * change shape to make a test pass, that is a finding about the design, not
 * a detail to paper over.
 *
 * The editing surface is BlockNote (ADR 0074), so the helpers here drive a
 * single contenteditable the way a person does — click, select, type, press
 * "/" — rather than filling one form control per block. That is a deliberate
 * cost: these tests are slower and fussier than `fill()` on a textbox would
 * be, and in exchange they exercise the interaction people actually have.
 *
 * Selector policy, deliberately split:
 *
 *   - The SITE is queried by accessible role and name only. Those pages are
 *     citizen-facing, so every selector here doubles as an assertion that
 *     the block renderer emits an accessible tree. A test that can only be
 *     written with a test id is telling you the markup is wrong.
 *
 *   - The EDITOR is queried by test id, except for blocks themselves, which
 *     are addressed by the `data-id` BlockNote puts on every block node. The
 *     adapter seeds those from our own block ids, so `[data-id="b_sv04"]`
 *     resolving at all is the same assertion as "ids survive the round trip".
 */

import { expect, type Locator, type Page } from "@playwright/test";

export const SEVERANCE_URL =
  "/money-financial-support/calculate-severance-pay/start";
export const CALENDAR_URL = "/bank-holiday-calendar";
export const PHARMACY_URL =
  "/health-and-emergency-services/find-an-open-pharmacy/find";
export const CROP_OVER_URL = "/business-trade/crop-over-permits";
export const HAIR_SALON_URL = "/business-trade/apply-for-hair-salon-licence";

/** Titles as seeded, used to pick a document out of the editor's list. */
export const DOC = {
  severance: "Find out how much severance payment you are owed",
  calendar: "Bank holidays",
  pharmacies: "Search for pharmacies",
  cropOver: "Find the permits you need for a Crop Over event",
  hairSalon: "Apply for a hairdressing and beautician business licence",
} as const;

/**
 * Five content pages plus two stubs. The stubs exist because rule 8 makes an
 * internal `start_link` resolve, and both the severance and Crop Over start
 * pages point at a form — so a seed without them cannot save. The hair salon
 * page needs none, because its application form is out of scope and it
 * carries no start_link.
 */
export const SEEDED_DOCUMENT_COUNT = 7;

/**
 * PGlite compiles WASM and runs the migration and seed on first paint.
 * Every helper that lands on a page goes through here so no test races the
 * boot, and so "the database came up at all" fails in one obvious place
 * rather than as a puzzling selector timeout twenty lines later.
 */
export async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByTestId("db-ready")).toBeAttached({ timeout: 60_000 });
}

export async function gotoEditor(page: Page): Promise<void> {
  await page.goto("/editor");
  await waitForReady(page);
}

/** Open a block's settings popover, from "Edit" above "Delete". */
export async function openBlockSettings(
  page: Page,
  blockId: string,
): Promise<Locator> {
  await hoverBlock(page, blockId);
  // A data-backed block puts its records behind "Edit" and its own
  // configuration behind the cog; every other block has only "Edit".
  const cog = page.getByTestId(`block-settings-${blockId}`);
  const edit = page.getByTestId(`block-edit-${blockId}`);
  await ((await cog.count()) > 0 ? cog : edit).click();
  const popover = page.getByTestId("block-popover");
  await expect(popover).toBeVisible();
  return popover;
}

/** Open a data-backed block's collection records. */
export async function openBlockData(
  page: Page,
  blockId: string,
): Promise<Locator> {
  await hoverBlock(page, blockId);
  await page.getByTestId(`block-edit-data-${blockId}`).click();
  const modal = page.getByTestId("modal");
  await expect(modal).toBeVisible();
  return modal;
}

/**
 * Open a seeded document by its title.
 *
 * Resolved through the store rather than by clicking a list, because the
 * editor's front door is now a category → service hierarchy: finding a page
 * by title would mean knowing which service it lives under, which is not
 * what most of these tests are about. `hierarchy.spec.ts` walks the browse
 * path deliberately; everything else goes straight to the document.
 */
export async function openDocument(page: Page, title: string): Promise<void> {
  await gotoEditor(page);
  const id = await page.evaluate(async (wanted) => {
    const store = (
      window as unknown as {
        __spikeStore: {
          list: () => Promise<Array<{ id: string; title: string }>>;
        };
      }
    ).__spikeStore;
    return (await store.list()).find((doc) => doc.title === wanted)?.id ?? null;
  }, title);
  if (!id) throw new Error(`No seeded document titled "${title}"`);
  await page.goto(`/editor/${id}`);
  await expect(editorSurface(page)).toBeVisible();
}

export async function gotoSite(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
}

/* ------------------------------------------------------------- the editor */

/** The BlockNote contenteditable holding the whole document. */
export const editorSurface = (page: Page): Locator =>
  page.getByTestId("editor-surface");

/**
 * One block, addressed by the `data-id` BlockNote renders on its node. The
 * adapter seeds these from our block ids, so this selector is stable across
 * edits by construction — and stops resolving the moment something renumbers.
 */
export const block = (page: Page, id: string): Locator =>
  page.locator(`[data-id="${id}"]`);

export const blockByType = (page: Page, type: string): Locator =>
  page.locator(`[data-block-type="${type}"]`).first();

/**
 * There is no preview pane any more — the document *is* the preview, so an
 * assertion about "what the author sees rendered" is an assertion about the
 * editing surface. Kept as a name because that is what the tests mean.
 */
export const preview = editorSurface;

/** Ids of the blocks currently in the document, in document order. */
export async function blockIds(page: Page): Promise<string[]> {
  return JSON.parse(await bodyJson(page)).blocks.map(
    (b: { id: string }) => b.id,
  );
}

/**
 * The serialized body, read out of the "View schema" modal so the round
 * trip is observable. Read-only — the palette is the only way to change it.
 */
export async function bodyJson(page: Page): Promise<string> {
  await page.getByTestId("doc-json-toggle").click();
  const text = await page.getByTestId("doc-json").innerText();
  await page.getByTestId("modal-close").click();
  await expect(page.getByTestId("modal")).toHaveCount(0);
  return text;
}

/* -------------------------------------------------------------- editing */

/**
 * Replace a prose block's text the way a person would: select the paragraph,
 * then type over it.
 *
 * There is no per-block form control to `fill()` — the whole document is one
 * contenteditable — so a triple click to select the paragraph is both the
 * realistic gesture and the only reliable one.
 */
export async function replaceText(
  page: Page,
  blockId: string,
  text: string,
): Promise<void> {
  await block(page, blockId).click({ clickCount: 3 });
  await page.keyboard.type(text);
}

export const blockText = (page: Page, blockId: string): Promise<string> =>
  block(page, blockId).innerText();

/**
 * Insert a block through the slash menu — Notion's affordance, and the one
 * §3.6 of the brief is really describing when it says the insert menu *is*
 * the content model made visible.
 */
export async function insertBlockAfter(
  page: Page,
  afterBlockId: string,
  type: string,
): Promise<void> {
  await block(page, afterBlockId).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await openSlashMenu(page);
  await page.getByTestId(`slash-item-${type}`).click();
}

export async function openSlashMenu(page: Page): Promise<Locator> {
  await page.keyboard.type("/");
  const menu = page.getByTestId("slash-menu");
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Reorder by keyboard.
 *
 * Dragging is the mouse affordance and it is covered once, in
 * prose-round-trip. This is the one that has to work for keyboard and
 * screen-reader users, so it is what the rest of the suite pins — a
 * drag-only reorder would fail the Barbados Service Standards.
 */
export async function moveBlockUp(page: Page, blockId: string): Promise<void> {
  await block(page, blockId).click();
  await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
}

/**
 * Hover a block so its control strip appears in the right margin.
 *
 * Aimed near the top-left of the block: a finder is over a thousand pixels
 * tall, and hovering its centre scrolls it out from under the pointer.
 */
export async function hoverBlock(page: Page, blockId: string): Promise<void> {
  const box = await block(page, blockId).boundingBox();
  await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 8);
  await expect(page.getByTestId(`block-controls-${blockId}`)).toBeVisible();
}

export async function deleteBlock(page: Page, blockId: string): Promise<void> {
  await hoverBlock(page, blockId);
  await page.getByTestId(`block-delete-${blockId}`).click();
}

/* --------------------------------------------------------------- saving */

/**
 * Persist to Postgres. Autosave only ever writes a draft to localStorage, so
 * this is the only thing that changes what the site serves.
 *
 * Ctrl/Cmd+S and the Save button are the same act; the keyboard route is
 * used here because it works wherever the caret happens to be.
 */
export async function flushSave(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+s");
}

export const saveButton = (page: Page): Locator => page.getByTestId("save");

/** Keys the editor caches drafts under, for asserting what autosave did. */
export async function localDraftKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) =>
      key.startsWith("spike:draft:"),
    ),
  );
}

export const saveStatus = (page: Page): Locator =>
  page.getByTestId("save-status");

export async function saveAndExpectSuccess(page: Page): Promise<void> {
  await flushSave(page);
  await expect(saveStatus(page)).toHaveText(/^saved$/i);
  await expect(page.getByTestId("error-summary")).toHaveCount(0);
}

/** Save and assert it was rejected, returning the error summary locator. */
export async function saveAndExpectRejection(page: Page): Promise<Locator> {
  await flushSave(page);
  const summary = page.getByTestId("error-summary");
  await expect(summary).toBeVisible();
  // A rejected save must leave the document dirty, never quietly "Saved".
  await expect(saveStatus(page)).toHaveText(/unsaved/i);
  return summary;
}

/* --------------------------------------------------------------- the site */

export const filterSidebar = (page: Page): Locator =>
  page.getByRole("complementary", { name: "Filters" });

export const results = (page: Page): Locator =>
  page.getByRole("list", { name: "Results" });

export const resultItems = (page: Page): Locator =>
  results(page).getByRole("listitem");

export const resultCount = (page: Page): Locator =>
  page.getByTestId("result-count");

export const pagination = (page: Page): Locator =>
  page.getByRole("navigation", { name: "Pagination" });

/**
 * The calendar is a list of cards, not a table — a date tile down the left,
 * the holiday beside it, the day on the right. Matched to the live page.
 */
export const calendarRows = (page: Page): Locator => page.locator(".bk-row");

/** The row for a named holiday in a given year's section of the calendar. */
export function holidayRow(page: Page, name: string): Locator {
  return page.locator(".bk-row").filter({ hasText: name });
}

/** Move the calendar's year. It is Previous/Next, not a dropdown. */
export async function goToYear(page: Page, year: number): Promise<void> {
  const calendar = page.locator(".bk-cal");
  for (let guard = 0; guard < 40; guard++) {
    const shown = Number(await calendar.getAttribute("data-year"));
    if (shown === year) return;
    const label = shown < year ? /Next year/ : /Previous year/;
    // The switcher is rendered twice — above the list and below it, as the
    // live page has it — so either one will do.
    await page.getByRole("button", { name: label }).first().click();
  }
  throw new Error(`Could not reach ${year}`);
}
