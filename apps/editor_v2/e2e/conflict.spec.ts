/**
 * Optimistic concurrency, driven through two real tabs.
 *
 * One user in one browser will rarely hit this. The point of building it now
 * is that the call sites, the error path and the UI all exist from day one,
 * so pointing `DocumentStore` at a server later is not a refactor.
 */

import { expect, test } from "@playwright/test";
import {
  DOC,
  bodyJson,
  openDocument,
  editorSurface,
  flushSave,
  replaceText,
  saveStatus,
  saveAndExpectSuccess,
} from "./support";

test.describe("a stale save is refused", () => {
  test("the second tab is told its copy is out of date, and nothing is lost", async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();

    // Both tabs load the same document at the same version.
    await openDocument(first, DOC.severance);
    await openDocument(second, DOC.severance);

    await replaceText(first, "b_sv04", "About 5 minutes.");
    await saveAndExpectSuccess(first);

    // The second tab is now holding the updated_at it loaded, which is stale.
    await replaceText(second, "b_sv04", "About 90 minutes.");
    await flushSave(second);

    const conflict = second.getByTestId("conflict-notice");
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText(/changed/i);
    await expect(saveStatus(second)).toHaveText(/unsaved/i);

    // The winning write stands; the losing one was not silently applied.
    await first.reload();
    await expect(editorSurface(first)).toBeVisible();
    expect(await bodyJson(first)).toContain("About 5 minutes.");
    expect(await bodyJson(first)).not.toContain("About 90 minutes.");
  });

  test("reloading the stale tab clears the conflict and lets the edit through", async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await openDocument(first, DOC.severance);
    await openDocument(second, DOC.severance);

    await replaceText(first, "b_sv04", "One.");
    await saveAndExpectSuccess(first);

    await replaceText(second, "b_sv04", "Two.");
    await flushSave(second);
    await expect(second.getByTestId("conflict-notice")).toBeVisible();

    await second.reload();
    await expect(editorSurface(second)).toBeVisible();
    await expect(second.getByTestId("conflict-notice")).toHaveCount(0);

    await replaceText(second, "b_sv04", "Two.");
    await saveAndExpectSuccess(second);
    expect(await bodyJson(second)).toContain("Two.");
  });

  test("saving twice in a row from the same tab does not self-conflict", async ({
    page,
  }) => {
    // The version the tab holds has to advance on every successful save,
    // or the second save collides with the tab's own first one.
    await openDocument(page, DOC.severance);

    await replaceText(page, "b_sv04", "First.");
    await saveAndExpectSuccess(page);

    await replaceText(page, "b_sv04", "Second.");
    await saveAndExpectSuccess(page);

    await expect(page.getByTestId("conflict-notice")).toHaveCount(0);
    expect(await bodyJson(page)).toContain("Second.");
  });
});
