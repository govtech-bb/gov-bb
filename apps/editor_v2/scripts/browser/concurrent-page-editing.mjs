import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium } from "./playwright.mjs";

if (!process.send)
  throw new Error(
    "Run concurrent-page-editing.mjs through scripts/browser/run.mjs; its API fixture owns an isolated PostgreSQL database.",
  );

const setupReply = once(process, "message");

process.send({ action: "ready" });

const [fixture] = await setupReply;

const base = new URL(process.argv[2]);

const { apiOrigin, serviceId, pageId, unsupportedId } = fixture;

const control = async (action) => {
  const reply = once(process, "message");
  process.send({ action });
  assert.equal((await reply)[0].done, action);
};

const browser = await chromium.launch();

const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

await first.addCookies([
  { name: "browser-employee", value: "one", url: apiOrigin, sameSite: "Lax" },
]);

await second.addCookies([
  { name: "browser-employee", value: "two", url: apiOrigin, sameSite: "Lax" },
]);

const a = await first.newPage(),
  b = await first.newPage(),
  c = await second.newPage();

const errors = [],
  credentials = new Map();

for (const page of [a, b, c]) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/pages/${pageId}/lock` && request.method() === "POST")
      credentials.set(page, request.headers()["x-page-edit-lock-token"]);
  });
  page.setDefaultTimeout(20_000);
}

const path = (id) => new URL(`/services/${serviceId}/${id}`, base).href;

const title = (page) => page.getByRole("textbox", { name: "Page title", exact: true });

const button = (page, name) => page.getByRole("button", { name, exact: true });

const editable = (page) =>
  page.waitForFunction(() => {
    const input = document.querySelector('textarea[aria-label="Page title"]');

    return input && !input.readOnly;
  });

const read = async () => {
  const response = await second.request.get(`${apiOrigin}/pages/${pageId}`, {
    headers: { origin: base.origin },
  });

  assert.equal(response.status(), 200);

  return response.json();
};

const fieldsOf = (page) => {
  const {
    version,
    url,
    category_id,
    title,
    description,
    visibility,
    form_id,
    body_markdown,
    frontmatter,
  } = page;

  return {
    version,
    url,
    category_id,
    title,
    description,
    visibility,
    form_id,
    body_markdown,
    frontmatter,
  };
};

const takeover = async (page) => {
  const fresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/pages/${pageId}` &&
      response.request().method() === "GET",
  );

  await button(page, "Take over editing").click();
  const dialog = page.getByRole("alertdialog", { name: "Take over editing?", exact: true });
  await dialog.getByRole("button", { name: "Take over editing", exact: true }).click();
  await editable(page);
  assert.equal((await fresh).status(), 200);
};

const save = async (page) => {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/pages/${pageId}` &&
      response.request().method() === "PUT",
  );

  await button(page, "Save").click();
  assert.equal((await response).status(), 200);
  await page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();
};

try {
  await a.goto(path(pageId));
  await editable(a);
  const initial = await read();
  assert.equal(initial.version, 1);
  await title(a).fill("Unsaved first tab");
  const tokenA = credentials.get(a);
  assert.ok(tokenA);

  await b.goto(path(pageId));
  await b.getByText("is editing this page in another session.", { exact: false }).waitFor();
  assert.equal(await title(b).getAttribute("readonly"), "");
  assert.equal(await button(b, "Save").isDisabled(), true);
  assert.equal(await button(b, "Undo").isDisabled(), true);
  assert.equal(await b.getByLabel("Form ID", { exact: true }).isDisabled(), true);
  await button(b, "Preview page").click();
  await b.locator("[data-cms-preview-article]").waitFor();
  assert.equal(await button(b, "Edit content").isDisabled(), true);
  await button(b, "Close preview").click();
  await takeover(b);
  assert.notEqual(credentials.get(b), tokenA);
  assert.equal((await read()).version, 1, "takeover changes no content version");
  await title(b).fill("Saved by the second tab");
  await save(b);
  const savedByB = await read();
  assert.equal(savedByB.version, 2);
  // No synthetic focus/resume: the ordinary heartbeat must detect the takeover.
  await a.waitForFunction(
    () => document.querySelector('textarea[aria-label="Page title"]')?.readOnly === true,
    undefined,
    { timeout: 40_000 },
  );
  assert.equal(await title(a).inputValue(), "Unsaved first tab");
  assert.equal(await button(a, "Save").isDisabled(), true);

  await c.goto(path(pageId));
  await button(c, "Take over editing").waitFor();
  await takeover(c);
  const headers = { origin: base.origin, "x-page-edit-lock-token": credentials.get(b) };

  const staleOwner = await first.request.put(`${apiOrigin}/pages/${pageId}`, {
    headers,
    data: fieldsOf(savedByB),
  });

  assert.equal(staleOwner.status(), 409);
  assert.equal((await staleOwner.json()).error, "page_edit_lock_lost");

  const copiedToken = await first.request.put(`${apiOrigin}/pages/${pageId}`, {
    headers: { ...headers, "x-page-edit-lock-token": credentials.get(c) },
    data: fieldsOf(savedByB),
  });

  assert.equal(
    copiedToken.status(),
    409,
    "another employee cannot use a copied acquisition credential",
  );
  await title(c).fill("Saved by second employee");
  await save(c);
  assert.equal((await read()).version, 3);

  await a.bringToFront();
  await a.evaluate(() => window.dispatchEvent(new Event("focus")));
  await button(a, "Take over editing").waitFor();
  await takeover(a);
  assert.equal(await title(a).inputValue(), "Unsaved first tab");

  const staleVersion = await first.request.put(`${apiOrigin}/pages/${pageId}`, {
    headers: { ...headers, "x-page-edit-lock-token": credentials.get(a) },
    data: fieldsOf(initial),
  });

  assert.equal(staleVersion.status(), 409);
  assert.equal((await staleVersion.json()).error, "page_version_conflict");
  await button(a, "Keep my version").click();
  await save(a);
  assert.equal((await read()).title, "Unsaved first tab");
  assert.equal((await read()).version, 4);

  await control("idle-prompt");
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.getByRole("alertdialog", { name: "Are you still editing?" }).waitFor();
  await button(a, "I'm still editing").click();
  await editable(a);
  await title(a).fill("Keep when idle or signed out");
  await control("idle-expire");
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.getByText("Your editing lock expired.", { exact: false }).waitFor();
  assert.equal(await title(a).inputValue(), "Keep when idle or signed out");
  assert.equal(await button(a, "Save").isDisabled(), true);
  await button(a, "Start editing").click();
  await editable(a);

  await control("expire-auth");
  await a.evaluate(() => window.dispatchEvent(new Event("focus")));
  await a.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await a.getByText("Your session has ended.", { exact: false }).first().waitFor();
  assert.equal(await title(a).inputValue(), "Keep when idle or signed out");
  assert.equal(await button(a, "Save").isDisabled(), true);
  const downloadEvent = a.waitForEvent("download");
  await button(a, "Download source").click();
  const download = await downloadEvent;
  assert.match(await readFile(await download.path(), "utf8"), /Keep when idle or signed out/);
  await control("restore-auth");
  await a
    .getByRole("navigation", { name: "Service documents" })
    .getByRole("link", { name: /Unsupported page/ })
    .click();
  await a
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave without saving", exact: true })
    .click();
  await a.getByText("This page can't be edited here").waitFor();
  await button(a, "Delete page").click();
  await control("change-unsupported");

  const refusal = a.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/pages/${unsupportedId}` &&
      response.request().method() === "DELETE",
  );

  await a
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  assert.equal((await refusal).status(), 409);
  await a.getByText("This page changed after you reviewed it.", { exact: false }).waitFor();
  assert.equal(
    await a
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete page", exact: true })
      .isDisabled(),
    true,
  );
  await a.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await button(a, "Load saved version").click();
  await button(a, "Delete page").click();

  const deleted = a.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/pages/${unsupportedId}` &&
      response.request().method() === "DELETE",
  );

  await a
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  assert.equal((await deleted).status(), 204);
  assert.equal((await second.request.get(`${apiOrigin}/pages/${unsupportedId}`)).status(), 404);
  assert.deepEqual(errors, []);
  console.log(
    "PASS real API concurrent editing: same-user tabs, two employees, heartbeat loss, version fencing, read-only preview, idle/expiry, auth recovery/export and reviewed unsupported-page deletion",
  );
} finally {
  await browser.close();
  process.disconnect();
}
