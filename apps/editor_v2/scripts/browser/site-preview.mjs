import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { authenticatedContext, servicesFixture } from "./auth-fixture.mjs";
import { fixtureCategory } from "./page-api-fixture.mjs";
import { chromium } from "./playwright.mjs";

const markdown = await readFile(
  new URL(
    "../../../landing/src/content/apply-to-be-a-project-protege-mentor/index.md",
    import.meta.url,
  ),
  "utf8",
);

const [, yaml, bodyMarkdown] = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);

const metadata = parse(yaml);

const service = {
  ...servicesFixture[0],
  title: metadata.title,
  url: "/work-employment/apply-to-be-a-project-protege-mentor",
  category: { slug: "work-employment", title: "Work and employment" },
  visibility: "public",
};

const category = fixtureCategory(
  "55555555-5555-4555-8555-555555555555",
  "work-employment",
  "Work and employment",
  { services: 1 },
);

// The lede leads the frontmatter when the page has one, as api_v2 stores it
const frontmatter = {};

if (metadata.lede) frontmatter.lede = metadata.lede;

Object.assign(frontmatter, {
  source_url: "",
  stage: "beta",
  service_type: "other",
  keywords: [""],
});

let current = {
  id: service.id,
  parent_id: null,
  category_id: category.id,
  url: service.url,
  slug: "apply-to-be-a-project-protege-mentor",
  title: metadata.title,
  description: metadata.description ?? null,
  visibility: "public",
  form_id: metadata.form_id ?? null,
  body_markdown: bodyMarkdown,
  frontmatter,
  published_at: "2026-01-13T12:00:00.000Z",
  created_at: "2026-01-13T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
  pending_revision: null,
};

const writes = [];

let holdSave = false;

let releaseSave;

const browser = await chromium.launch();

// Geometry assertions compare resting layouts, not the sidebar's width transition.
const context = await authenticatedContext(browser, {
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});

await context.route("**/*", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (request.resourceType() === "document") return route.fallback();

  const values = {
    "/services": [service],
    [`/services/${service.id}`]: { service, pages: [{ ...current, role: "entry" }] },
    [`/pages/${service.id}`]: current,
    [`/pages/${service.id}/revision/submit`]: undefined,
    "/editor/categories": { categories: [category] },
    "/version": { count: 1, latest: current.updated_at },
    // An approver, so the page's visibility can be changed
    "/editor/me": {
      id: "test-user",
      email: "employee@govtech.bb",
      name: "Test employee",
      roles: ["editor", "approver"],
    },
  };

  if (!(path in values)) return route.fallback();

  const headers = {
    "access-control-allow-origin": request.headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, if-updated-at",
  };

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  // As api_v2 does: submitting sends the draft for review without moving the page's version
  if (path.endsWith("/revision/submit")) {
    current = { ...current, pending_revision: { status: "submitted", comment: null } };

    return route.fulfill({ json: { status: "submitted", comment: null, changes: [] }, headers });
  }

  if (request.method() !== "GET") {
    const fields = request.postDataJSON();
    writes.push(fields);

    if (request.headers()["if-updated-at"] !== current.updated_at)
      return route.fulfill({ status: 409, json: { error: "conflict" }, headers });

    if (holdSave)
      await new Promise((resolve) => {
        releaseSave = resolve;
      });
    // As api_v2 does: a save that keeps a public page public waits for an approver as a revision
    const reviewed = current.visibility === "public" && fields.visibility === "public";
    current = {
      ...current,
      ...fields,
      updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
      pending_revision: reviewed ? { status: "draft", comment: null } : null,
    };

    return route.fulfill({ json: current, headers });
  }

  return route.fulfill({ json: values[path], headers });
});

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const button = (name) => page.getByRole("button", { name, exact: true });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const introduction = page.getByRole("textbox", { name: "Introduction", exact: true });

const writerGeometry = () =>
  title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      x: rect.x,
      width: rect.width,
      height: rect.height,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      color: style.color,
    };
  });

try {
  const url = new URL(
    `/services/${service.id}/${service.id}`,
    process.argv[2] ?? "http://127.0.0.1:3060",
  );

  await page.goto(new URL("/services", url).href);
  await page.getByRole("link", { name: service.title, exact: true }).click();
  await title.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const before = await writerGeometry();
  assert.equal(await button("Markdown").count(), 0, "pages have no Markdown source to open");
  await button("Preview page").click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  assert.equal(page.url(), url.href, "preview never redirects to landing");
  assert.equal(await page.locator("iframe").count(), 0);
  // The built renderer has its own React runtime; its IDs must not collide with the retained CMS.
  assert.equal(
    await page.locator("[data-cms-site-preview] header button[aria-controls]").evaluate((menu) => {
      const id = menu.getAttribute("aria-controls");
      const navigation = document.getElementById(id);

      return (
        document.querySelectorAll(`[id="${id}"]`).length === 1 &&
        navigation === menu.closest("header").querySelector("nav")
      );
    }),
    true,
    "public menu controls the preview navigation, never a CMS element",
  );
  assert.equal(
    await page
      .locator("[data-document-bar]:visible")
      .evaluate((element) => getComputedStyle(element).display),
    "flex",
  );
  assert.equal(
    await page
      .locator("[data-cms-site-preview] .govbb-prose")
      .evaluate((element) => getComputedStyle(element).fontSize),
    "20px",
  );
  await page.getByText("Last updated on January 13th, 2026", { exact: true }).waitFor();
  await page
    .locator("[data-cms-site-preview]")
    .getByRole("link", { name: "Work and employment", exact: true })
    .waitFor();
  // Preview controls share the document bar; explanatory text lives in its popover.
  assert.equal(
    await page.evaluate(() =>
      Math.round(
        document.querySelector("[data-cms-site-preview]").getBoundingClientRect().top -
          document
            .querySelector("[data-cms-preview-host] [data-document-bar]")
            .getBoundingClientRect().bottom,
      ),
    ),
    0,
  );
  assert.equal(await button("Page settings").count(), 0);
  assert.equal(await button("Undo").count(), 0, "undo and redo show only while editing");
  await button("About this preview").click();
  await page
    .getByRole("dialog", { name: "About this preview", exact: true })
    .getByText("Links, buttons and the feedback form don’t work here.", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
  const reference = await context.newPage();
  reference.on("pageerror", (error) => console.error("Public reference:", error.message));
  await reference.goto(`${process.argv[3] ?? "http://127.0.0.1:3040"}${service.url}`);

  const measure = (target, root) =>
    target.locator(root).evaluate((root) => {
      const origin = root.getBoundingClientRect();

      return ["header", "h1", ".govbb-prose", ".govbb-prose p", ".govbb-prose h2", "footer"].map(
        (selector) => {
          const element = root.querySelector(selector);
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          return {
            selector,
            x: rect.x,
            y: Math.round((rect.top - origin.top) * 100) / 100,
            width: rect.width,
            height: rect.height,
            font: style.font,
            color: style.color,
          };
        },
      );
    });

  for (const width of [390, 800, 1000, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await reference.setViewportSize({ width, height: 1000 });
    await reference.goto(`${process.argv[3] ?? "http://127.0.0.1:3040"}${service.url}`);
    await reference.locator("header[data-govbb-header-enhanced]").waitFor();
    await reference.evaluate(() => document.fonts.ready);
    await Promise.all(
      [page, reference].map((target) =>
        target.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        ),
      ),
    );
    assert.deepEqual(
      await measure(page, "[data-cms-site-preview]"),
      await measure(reference, "body"),
      `actual CMS/public parity at ${width}px`,
    );
  }

  await reference.close();
  // A clean preview can become an inactive cached pane without retaining site styles or an editor root.
  await page.goBack();
  await page.getByRole("link", { name: service.title, exact: true }).waitFor();
  assert.equal(await page.locator("[data-cms-preview-host]").count(), 0);
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 0);
  assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
  await page.getByRole("link", { name: service.title, exact: true }).click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  await button("Close preview").click();
  // The Published state requires byte-identical working Markdown and server baseline.
  await page
    .locator("[data-document-bar]:visible")
    .getByText("Published", { exact: true })
    .waitFor();
  assert.deepEqual(writes, [], "a no-op preview leaves the page as it was saved");
  await button("Preview page").click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  await button("Edit content").click();
  await title.waitFor();
  await body.waitFor();
  assert.equal(await button("Edit content").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
  assert.equal(await page.locator(".page-document-writing").count(), 0);
  await title.fill("Corrected mentor title");
  await introduction.fill("An introduction corrected in the site preview.");
  await body.click();
  await body.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element.querySelector("p"));
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.keyboard.insertText("Corrected in preview. ");
  assert.ok((await body.innerText()).includes("Corrected in preview. "));
  assert.deepEqual(writes, []);
  await page.screenshot({ path: "/tmp/govbb-site-preview/inline-cms-1440.png", fullPage: true });
  await button("Close preview").click();
  assert.equal(page.url(), url.href);
  assert.equal(
    await button("Preview page").evaluate((element) => element === document.activeElement),
    true,
  );
  assert.equal(await title.inputValue(), "Corrected mentor title");
  assert.equal(await introduction.inputValue(), "An introduction corrected in the site preview.");
  assert.ok((await body.innerText()).includes("Corrected in preview. "));
  await button("Undo").click();
  assert.ok(!(await body.innerText()).includes("Corrected in preview. "));
  await button("Undo").click();
  assert.equal(await introduction.inputValue(), metadata.lede ?? "");
  await button("Undo").click();
  assert.equal(await title.inputValue(), metadata.title);
  assert.deepEqual(await writerGeometry(), before, "ordinary writer styles are restored");
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 0);
  assert.equal(await page.locator('[contenteditable="true"]').count(), 1);
  assert.deepEqual(writes, [], "preview typing, blur, exit and undo never publish");
  await button("Preview page").click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  const feedback = page.locator("[data-cms-site-preview] a[href='/feedback']");
  await feedback.click();
  await feedback.press("Enter");
  assert.equal(page.url(), url.href);
  assert.deepEqual(writes, []);
  await button("Edit content").click();
  await title.fill("Explicitly published from preview");
  await button("Edit content").click();
  await page
    .locator("[data-cms-site-preview] h1")
    .filter({ hasText: "Explicitly published from preview" })
    .waitFor();
  assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
  assert.deepEqual(writes, []);
  // A public page's save waits for an approver rather than publishing
  await button("Save").click();
  await page.locator("[data-document-bar]:visible").getByText("Saved", { exact: true }).waitFor();
  await page
    .getByText("Your changes are saved but not live. Submit them for review when they’re ready.")
    .first()
    .waitFor();
  await button("Submit for review").click();
  await page
    .getByText(
      "Waiting for review. Citizens will see these changes once an approver publishes them.",
    )
    .first()
    .waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].title, "Explicitly published from preview");
  await button("Close preview").click();
  assert.equal(await title.inputValue(), "Explicitly published from preview");
  // Unsupported styling is recoverable without a fallback renderer or draft reset.
  await body.locator("p").last().scrollIntoViewIfNeeded();
  const scrollBeforeRetry = await page.evaluate(() => window.scrollY);
  assert.ok(scrollBeforeRetry > 0);
  await page.evaluate(() => {
    window.previewScopeSupport = window.CSSScopeRule;
    delete window.CSSScopeRule;
  });
  // Isolate restoration from Playwright scrolling the trigger into view before a pointer click.
  await button("Preview page").evaluate((element) => element.click());
  await page.getByText(/Your working copy is unchanged/).waitFor();
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 0);
  await page.evaluate(() => {
    window.CSSScopeRule = window.previewScopeSupport;
  });
  await button("Retry preview").click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 1);
  await button("Close preview").click();
  assert.equal(await title.inputValue(), "Explicitly published from preview");
  assert.equal(
    await page.evaluate(() => window.scrollY),
    scrollBeforeRetry,
    "retry preserves the original writer scroll position",
  );

  // Give browser Back a real in-workspace history entry, and reopen the retained session.
  await page.locator("header").getByRole("link", { name: "Services", exact: true }).click();
  await page.getByRole("link", { name: service.title, exact: true }).click();
  await title.waitFor();
  await button("Preview page").click();
  await page.locator("[data-cms-site-preview] .govbb-prose").waitFor();
  await button("Edit content").click();
  await title.fill("An unsaved inline title");
  await page.evaluate(() => history.back());
  const question = page.getByRole("alertdialog");
  await question.getByRole("heading", { name: "Leave without saving?", exact: true }).waitFor();
  assert.equal(
    await question.evaluate((element) => getComputedStyle(element).position),
    "relative",
  );
  await question.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await title.inputValue(), "An unsaved inline title");
  assert.equal(page.url(), url.href);

  // Reuse the real formatting controls: click-to-caret, selection, formatting and Escape.
  const paragraph = body.locator(":scope > p").first();
  await paragraph.click({ position: { x: 2, y: 10 } });
  assert.equal(await page.evaluate(() => window.getSelection().anchorOffset), 0);
  await page.keyboard.down("Shift");

  for (let index = 0; index < 6; index++) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await button("Bold").click();
  assert.ok((await paragraph.locator(".font-bold").innerText()).includes("Anyone"));
  await page.keyboard.press("Escape");
  await button("Undo").click();
  assert.equal(await paragraph.locator(".font-bold").count(), 0);
  await paragraph.selectText();
  await page.keyboard.press("ControlOrMeta+k");
  const link = page.getByRole("combobox", { name: "Link", exact: true });
  await link.fill("/inline-guidance");
  await button("Apply").click();
  await link.waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  assert.equal(await paragraph.locator("a").getAttribute("href"), "/inline-guidance");
  await button("Undo").click();
  assert.equal(await paragraph.locator("a").count(), 0);
  await title.focus();
  await title.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  assert.equal(await title.evaluate((element) => element === document.activeElement), true);

  // Insertion and table controls are the writer's existing modules, now in the site body.
  await button("Add content").click();
  const insertionSearch = page.getByRole("combobox", { name: "Search page content", exact: true });
  await insertionSearch.fill("table");
  await insertionSearch.press("Enter");
  const table = body.locator("table");
  await table.waitFor();
  const rows = await table.locator("tr").count();
  const firstCell = await table.locator("th").first().boundingBox();
  const lastCell = await table.locator("td").last().boundingBox();
  await page.mouse.move(firstCell.x + firstCell.width / 2, firstCell.y + firstCell.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastCell.x + lastCell.width / 2, lastCell.y + lastCell.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  const selectedCells = table.locator(".page-table-cell-selected");
  await selectedCells.first().waitFor();
  assert.ok((await selectedCells.count()) > 1);
  assert.notEqual(
    await selectedCells.first().evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgba(0, 0, 0, 0)",
    "inline table selection remains visible",
  );
  await table.locator("td").last().click();
  await page.keyboard.insertText("(246) 123-4567");
  await button("Block options").click();
  await page.getByRole("menuitem", { name: "Add row", exact: true }).click();
  assert.equal(await table.locator("tr").count(), rows + 1);
  await button("Undo").click();
  assert.equal(await table.locator("tr").count(), rows);
  await button("Edit content").click();
  await page.locator('[data-cms-site-preview] a[href="tel:+12461234567"]').waitFor();
  await button("Edit content").click();
  assert.ok((await table.innerText()).includes("(246) 123-4567"));
  assert.equal(
    await table.locator('a[href^="tel:"]').count(),
    0,
    "reader-generated telephone links never enter the page's content",
  );
  await button("Undo").click();
  await button("Undo").click();
  assert.equal(await table.count(), 0);

  // A pending save owns its submitted snapshot, not keystrokes made after it started.
  await title.fill("Submitted inline title");
  holdSave = true;
  const submitted = page.waitForRequest((request) => request.method() === "PUT");
  await button("Save").click();
  await submitted;
  await page.locator("[data-document-bar]:visible").getByText("Saving…", { exact: true }).waitFor();
  assert.equal(await button("Save").isDisabled(), true);
  await title.fill("Typed during publication");
  await page.evaluate(() => history.back());
  await question.getByRole("heading", { name: "A save is in progress", exact: true }).waitFor();
  await question.getByRole("button", { name: "Cancel", exact: true }).click();
  holdSave = false;
  releaseSave();
  await page
    .locator("[data-document-bar]:visible")
    .getByText("Unsaved changes", { exact: true })
    .waitFor();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].title, "Submitted inline title");
  assert.equal(await title.inputValue(), "Typed during publication");

  current = {
    ...current,
    title: "Another employee's version",
    updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
  };
  await button("Save").click();
  await page
    .getByText("A newer version of this page has been saved since you opened it.")
    .first()
    .waitFor();
  assert.equal(await title.inputValue(), "Typed during publication");
  await button("Keep my version").click();
  assert.equal(writes.length, 3, "keeping my version does not publish");

  // Mobile and zoom-equivalent narrow reflow, including a reduced-height phone keyboard viewport.
  for (const width of [720, 390, 320]) {
    await page.setViewportSize({ width, height: 460 });
    await title.fill("A long inline title with enough words to wrap on a narrow phone screen");
    const bounds = await title.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.equal(
      await page
        .locator("[data-document-bar]:visible")
        .evaluate((element) => getComputedStyle(element).position),
      "static",
    );
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => history.back());
  await question.getByRole("button", { name: "Leave without saving", exact: true }).click();
  await page.waitForURL(new URL("/services", url).href);
  assert.equal(await page.locator("style[data-cms-preview-styles]").count(), 0);
  assert.equal(await page.locator("[data-cms-preview-host]").count(), 0);

  // Making a page public is what still publishes at once
  current = {
    ...current,
    visibility: "preview",
    pending_revision: null,
    updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
  };
  await page.goto(url.href);
  await title.waitFor();

  if ((await button("Page settings").getAttribute("aria-expanded")) !== "true")
    await button("Page settings").click();
  await page.getByLabel("Visibility", { exact: true }).selectOption({ label: "Public" });
  await button("Publish changes").click();
  await page
    .locator("[data-document-bar]:visible")
    .getByText("Published", { exact: true })
    .waitFor();
  assert.equal(writes.at(-1).visibility, "public");
  assert.equal(current.pending_revision, null);
  assert.deepEqual(errors, []);
  console.log(
    "CMS/public parity; inline/undo; failure cleanup; menus; leave guard; pending save/conflict; narrow reflow; publishing: passed",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  console.error((await page.locator("body").innerText()).slice(0, 4000));
  await page.screenshot({ path: "/tmp/govbb-site-preview/cms-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
