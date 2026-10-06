// GovBB editor smoke test: blocks, menus, undo, drag, rubber band, and caret placement.
// node smoke1.mjs [url]
import { chromium } from "./playwright.mjs";

const url = process.argv[2] ?? "http://localhost:3013/";

const out = "/tmp/govbb-editor-smoke-";

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];

page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const results = [];

const check = (name, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const root = page.locator('[contenteditable="true"][aria-label="Form"]');
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}p1-demo.png`, fullPage: true });

  const blockCount = () =>
    page.evaluate(() => document.querySelector('[aria-label="Form"]').children.length);

  const titleText = () =>
    page.evaluate(() => document.querySelector('[aria-label="Form"]').children[0].textContent);

  const lastBlock = () => root.locator(":scope > *").last();

  // The general insertion checks need a question page; confirmation pages intentionally offer only content blocks.
  await page.getByRole("switch", { name: "Confirmation page", exact: true }).click();
  await page.waitForTimeout(150);

  // 1. The "/" menu lists only the kept blocks. The demo ends with a list: Enter on its new empty item leaves the list
  await lastBlock().locator("[data-text]").click();
  await page.waitForTimeout(100); // the editor settles the click's caret first, as it does for a person
  await page.keyboard.press("Meta+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.locator("#typeahead-menu [role=option]").first().waitFor();
  const entries = await page.locator("#typeahead-menu [role=option]").allInnerTexts();
  await page.screenshot({ path: `${out}p1-slash.png` });
  const titles = [...new Set(entries.map((t) => t.split("\n")[0].trim()))];

  const expected = [
    "Text input",
    "Textarea",
    "Radios",
    "Checkboxes",
    "Select",
    "Number",
    "Email address",
    "Phone number",
    "File upload",
    "Date input",
    "Time",
    "New page",
    "Confirmation page",
    "Text",
    "Heading 1",
    "Heading 2",
    "Heading 3",
    "Title (Mr, Ms, Dr)",
    "Question label",
    "Conditional logic",
    "Calculated fields",
  ];

  // The catalog must retain supported entries and exclude removed entries.
  const cut = [
    "Multi-select",
    "Ranking",
    "Rating",
    "Linear scale",
    "Matrix",
    "Payment",
    "Signature",
    "Divider",
    "Image",
    "Video",
    "Audio",
    "Embed",
    "Link",
    "Hidden fields",
    "Respondent's country",
    "reCAPTCHA",
    "Columns",
    "Label",
  ];

  check(
    "slash menu: kept blocks, nothing cut",
    expected.every((t) => titles.includes(t)) && !titles.some((t) => cut.includes(t)),
    titles.join(", "),
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");

  // 3. Undo removes an inserted page. Repeated insertions at the form's end are
  // covered by bug-undo-after-inserts.mjs.
  {
    const intro = root.locator(":scope > *", { hasText: "Use this form" }).first();
    await intro.scrollIntoViewIfNeeded();
    const b = await intro.boundingBox();
    await page.mouse.click(b.x + b.width - 3, b.y + b.height - 12);
    await page.waitForTimeout(100);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/new page");
    await page.locator("#typeahead-menu [role=option]").first().waitFor();
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    const inserted = await blockCount();
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(150);
    check("⌘Z undoes", (await blockCount()) < inserted, `${inserted} → ${await blockCount()}`);
  }

  // 2. Insert every kept block through "/" (search, Enter)
  const insert = async (query) => {
    await lastBlock().click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+ArrowRight");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`/${query}`);
    await page.locator("#typeahead-menu [role=option]").first().waitFor();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
  };

  const before = await blockCount();

  for (const q of [
    "short",
    "long",
    "multiple",
    "checkboxes",
    "dropdown",
    "number",
    "email",
    "phone",
    "file",
    "date",
    "time",
    "heading 2",
    "conditional",
    "calculated",
    "new page",
  ])
    await insert(q);
  const after = await blockCount();
  check("insert 15 blocks via /", after > before + 15, `${before} → ${after}`);
  await page.screenshot({ path: `${out}p1-inserted.png`, fullPage: true });

  // 4. Each kept block's menu opens (grip click) and lists its rows
  const menuRows = {};
  // Blocks are found by their text: demo additions shift positions
  const byText = (text) => root.locator(":scope > *", { hasText: text }).first();
  const after1 = (locator) => locator.locator("xpath=following-sibling::*[1]");

  for (const [name, block] of [
    ["Event name (text)", after1(byText("Event name"))],
    ["parish (dropdown)", byText("Christ Church")],
    ["file upload", byText("Upload a file")],
  ]) {
    await block.hover();
    await page.waitForTimeout(80);
    const grip = page.getByRole("button", { name: "Move this block by dragging" });
    await grip.click();
    const menu = page.locator("[role=menu]");
    await menu.waitFor({ timeout: 2000 }).catch(() => {});
    menuRows[name] = (await menu.innerText().catch(() => "(no menu)"))
      .split("\n")
      .filter(Boolean)
      .slice(0, 14)
      .join(" | ");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }

  check(
    "block menus open",
    Object.values(menuRows).every((t) => !t.includes("(no menu)")),
    JSON.stringify(menuRows),
  );

  // 5. Drag: the "Event date" question (title at nth 8) dropped below the dropdown's last option (nth 7) is a no-op; drop it after the first question instead
  const order = () =>
    page.evaluate(() =>
      [...document.querySelector('[aria-label="Form"]').children].map((el) =>
        el.textContent.slice(0, 18),
      ),
    );

  const start = await order();
  {
    const source = byText("Event date"); // its title
    const target = after1(byText("Event name")); // the "Event name" input
    await source.hover();
    await page.waitForTimeout(80);
    const grip = page.getByRole("button", { name: "Move this block by dragging" });
    const g = await grip.boundingBox();
    const t = await target.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + 5, g.y + 5, { steps: 3 });
    await page.mouse.move(t.x + 50, t.y + t.height - 6, { steps: 8 });
    await page.mouse.move(t.x + 51, t.y + t.height - 6);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  const moved = await order();
  check(
    "drag moves a question",
    JSON.stringify(start) !== JSON.stringify(moved),
    `${start.slice(2, 10).join(" / ")}  ⇒  ${moved.slice(2, 10).join(" / ")}`,
  );

  // 6. Rubber band from the right margin over three blocks selects them (menus closed first: undo can reopen "/")
  {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await root.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await byText("Use this form").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150); // Let selection restoration settle before measuring drag coordinates.
    const r = await root.boundingBox();
    const a = await after1(byText("Use this form")).boundingBox();
    const b = await after1(after1(after1(byText("Use this form")))).boundingBox();
    await page.mouse.move(r.x + r.width - 30, a.y + 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width - 300, b.y + 5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const selected = await page.locator("[aria-label=Form] > [data-selected]").count();
    check("rubber band selects blocks", selected >= 2, `${selected} selected`);
    await page.keyboard.press("Escape");
  }

  // 7. Bug #1: Esc, Esc, then typing never lands in the form title
  {
    const title = await titleText();
    await root.locator(":scope > *").nth(1).click(); // the intro paragraph
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.type("Q");
    await page.waitForTimeout(50);
    check(
      "Esc Esc then typing leaves the title alone",
      (await titleText()) === title,
      await titleText(),
    );
  }

  // … Esc then a click on another block's text puts the caret there
  {
    const title = await titleText();
    await root.locator(":scope > *").nth(1).click();
    await page.keyboard.press("Escape");
    const other = byText("Event name"); // a question title
    await other.click();
    await page.keyboard.press("Meta+ArrowRight");
    await page.keyboard.type("Z");
    await page.waitForTimeout(50);
    const text = (await other.locator("h2 [data-lexical-text]").allTextContents()).join("");
    check(
      "Esc then click on text types there",
      (await titleText()) === title && text.endsWith("Z"),
      `title=${await titleText()} block=${text}`,
    );
  }

  // … and a click on a widget (file upload) doesn't send keys to the title
  {
    const title = await titleText();
    const upload = page.locator("[data-lexical-decorator]").getByText("Upload a file").first();
    await upload.click();
    await page.keyboard.type("W");
    await page.waitForTimeout(50);
    check(
      "widget click then typing leaves the title alone",
      (await titleText()) === title,
      await titleText(),
    );
  }

  // 8. Bug #2: trashing the last block with the caret in it keeps the editor working
  {
    // Start this regression with a known text tail; the insertion check may end on a page widget.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await root.waitFor();
    await lastBlock().locator("[data-text]").click();
    await page.keyboard.press("Meta+ArrowRight");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Delete this tail");
    const last = lastBlock();
    await last.click({ position: { x: 8, y: 8 } });
    await last.hover({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(80);
    await page.getByRole("button", { name: "Delete this block" }).click();
    await root.click({ position: { x: 150, y: 5 } }).catch(() => {});
    await lastBlock().click({ position: { x: 8, y: 8 } });
    await page.keyboard.type("still works");
    await page.waitForTimeout(100);
    check(
      "trash last block, then type",
      errors.length === 0 && (await lastBlock().textContent()).includes("still works"),
      (await lastBlock().textContent()) ?? "",
    );
  }

  // 9. Reload keeps the draft
  await page.waitForTimeout(700);
  const saved = await blockCount();
  await page.reload();
  await root.waitFor();
  check(
    "reload keeps the draft",
    (await blockCount()) === saved,
    `${saved} → ${await blockCount()}`,
  );
  await page.screenshot({ path: `${out}p1-after.png`, fullPage: true });
} catch (e) {
  results.push(
    `ABORT ${e.message.split("\n")[0]} @ line ${(e.stack.match(/smoke1\.mjs:(\d+)/) ?? [])[1]}`,
  );
  await page.screenshot({ path: `${out}failure.png` }).catch(() => {});
} finally {
  check("no console or page errors", errors.length === 0, errors.slice(0, 5).join(" || "));
  console.log(results.join("\n"));

  if (results.some((result) => /^(FAIL|ABORT) /.test(result))) process.exitCode = 1;
  await browser.close();
}
