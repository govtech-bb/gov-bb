import { authenticatedContext } from "./auth-fixture.mjs";
import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";

const browser = await chromium.launch();

const context = await authenticatedContext(browser, { viewport: { width: 1440, height: 1000 } });

const page = await context.newPage();

await page.addInitScript(() => {
  const setDragImage = DataTransfer.prototype.setDragImage;

  DataTransfer.prototype.setDragImage = function (element, x, y) {
    document.documentElement.dataset.writerDragPreview = JSON.stringify({
      text: element.textContent,
      tag: element.tagName,
      inContent: !!element.closest(".page-editable"),
    });

    return setDragImage.call(this, element, x, y);
  };
});

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const url = process.argv[2] ?? "http://localhost:3015/";

const button = (name) => page.getByRole("button", { name, exact: true });

const body = page.getByRole("textbox", { name: "Page content", exact: true });

const source = page.getByRole("textbox", { name: "Markdown source", exact: true });

const search = page.getByRole("combobox", { name: "Search page content" });

const insertion = page.getByRole("listbox", { name: "Insert page content" });

const title = page.getByRole("textbox", { name: "Page title", exact: true });

const details = page.locator(".page-metadata-details:visible");

const description = details.getByLabel("Description", { exact: true });

const introduction = page.getByRole("textbox", { name: "Introduction", exact: true });

const addCategory = details.getByLabel("Add category", { exact: true });

const visibility = details.getByLabel("Visibility", { exact: true });

const publicationDate = details.getByLabel("Publication date", { exact: true });

const formId = details.getByLabel("Form ID", { exact: true });

const pageDetails = details.locator("summary");

const navigation = page.getByRole("navigation", { name: "Service documents" });

async function setPageDetailsOpen(open) {
  if ((await pageDetails.evaluate((element) => element.parentElement.open)) !== open)
    await pageDetails.click();
}

async function reset(content) {
  await page.getByRole("button", { name: /^Markdown/ }).click();
  await source.fill(`---\ntitle: Writer interactions\n---\n\n${content}\n`);
  await button("Apply changes").click();
  await button("Close source").click();
  await body.waitFor();
  await setPageDetailsOpen(false);
}

async function menuAt(locator) {
  await locator.click();
  await button("Block options").click();
}

async function hoverNestedMenu(locator) {
  await locator.hover();
  const nested = await locator.boundingBox();
  const rail = await button("Block options").boundingBox();
  assert.ok(nested);
  assert.ok(rail);
  // Cross the list padding, then travel up the gutter to the whole-block handle.
  await page.mouse.move(rail.x + rail.width / 2, nested.y + nested.height / 2, { steps: 10 });
  await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2, { steps: 10 });
  await page.mouse.click(rail.x + rail.width / 2, rail.y + rail.height / 2);
}

async function markdown() {
  await page.getByRole("button", { name: /^Markdown/ }).click();
  const value = await source.inputValue();
  await button("Close source").click();

  return value;
}

async function dragTo(block, target, side = "after") {
  await block.hover();
  await dragFromGrip(block, target, side);
}

async function dragFromGrip(block, target, side = "after") {
  const expectedPreview = await block.evaluate((element) => ({
    text: element.textContent,
    tag: element.tagName,
    inContent: true,
  }));

  const grip = await button("Block options").boundingBox();
  const destination = await target.boundingBox();
  assert.ok(grip);
  assert.ok(destination);
  await page.evaluate(() => {
    delete document.documentElement.dataset.writerDragPreview;
  });
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 8, grip.y + grip.height / 2 + 8, {
    steps: 3,
  });
  const x = destination.x + Math.min(50, destination.width / 2);
  const y = destination.y + destination.height * (side === "before" ? 0.2 : 0.8);
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.move(x + 1, y);
  await page.locator("[data-page-dragging]").waitFor();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(document.documentElement.dataset.writerDragPreview)),
    expectedPreview,
  );
}

async function crossToRail(block, control) {
  await block.scrollIntoViewIfNeeded();

  const line = await block.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      x: bounds.left + Math.min(60, bounds.width / 2),
      y:
        bounds.top +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.paddingTop) +
        parseFloat(style.lineHeight) / 2,
    };
  });

  await page.mouse.move(line.x, line.y);
  await page.waitForFunction(
    (center) => {
      const rail = document.querySelector(".page-block-rail");

      if (!rail) return false;
      const bounds = rail.getBoundingClientRect();

      return (
        Math.abs(bounds.top + bounds.height / 2 - center) < 2 &&
        Number(getComputedStyle(rail).opacity) > 0.99
      );
    },
    line.y,
    { timeout: 5000 },
  );
  const handle = await button(control).boundingBox();
  assert.ok(handle);
  const destination = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };

  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(
      line.x + ((destination.x - line.x) * step) / 20,
      line.y + ((destination.y - line.y) * step) / 20,
    );

    const rail = await page.locator(".page-block-rail").evaluate((element) => {
      const bounds = element.getBoundingClientRect();

      return { center: bounds.top + bounds.height / 2, opacity: getComputedStyle(element).opacity };
    });

    assert.ok(
      Math.abs(rail.center - line.y) < 2,
      `rail moved while crossing the gutter at step ${step}`,
    );
    assert.equal(
      Number(rail.opacity),
      1,
      `rail disappeared while crossing the gutter at step ${step}`,
    );
  }

  return destination;
}

async function finishDrag() {
  await page.mouse.up();
  await page.locator(".page-drop-line").waitFor({ state: "hidden" });
  await page.locator("[data-page-dragging]").waitFor({ state: "hidden" });
}

async function reorder(block, target, side = "after") {
  await dragTo(block, target, side);
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  await finishDrag();
}

async function focused(locator) {
  const element = await locator.elementHandle();
  assert.ok(element);
  await page.waitForFunction((element) => element === document.activeElement, element);
  await element.dispose();
}

async function insideViewport(locator) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  assert.ok(
    bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1,
    JSON.stringify(bounds),
  );
}

try {
  await page.goto(url);
  await page.getByRole("textbox", { name: "Form", exact: true }).waitFor();
  await button("Create service").click();
  await page.getByLabel("Service name", { exact: true }).fill("Writer interaction tests");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create service", exact: true })
    .click();
  await body.waitFor();
  await setPageDetailsOpen(false);

  await body.click();
  await page.keyboard.type("New text");
  await button("Block options").click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await body.textContent(), "");
  await button("Add text after block").click();
  assert.equal(await body.locator("p").count(), 2);
  await button("Undo").click();
  assert.equal(await body.locator("p").count(), 1);

  await reset(
    "Caret stays in this paragraph.\n\n# Heading one\n\nHover this paragraph without selecting it.\n\n## Heading two\n\n## A long second-level heading that wraps onto more than one line in the document canvas so its controls stay beside the first line\n\nLast paragraph.",
  );
  const hoverBaseline = await markdown();
  const caretParagraph = body.locator(":scope > p").first();
  const headingOne = body.locator("h1");
  const headingTwo = body.locator("h2").first();
  const wrappedHeading = body.locator("h2").last();
  assert.equal(
    await wrappedHeading.evaluate(
      (element) =>
        element.getBoundingClientRect().height >
        parseFloat(getComputedStyle(element).lineHeight) * 1.5,
    ),
    true,
    "the heading fixture must wrap onto multiple lines",
  );

  for (const hovered of [
    headingOne,
    headingTwo,
    wrappedHeading,
    body.locator(":scope > p").nth(1),
  ]) {
    await caretParagraph.click();
    const point = await crossToRail(hovered, "Block options");
    assert.equal(
      await page.evaluate(() => window.getSelection()?.anchorNode?.textContent),
      "Caret stays in this paragraph.",
    );
    await page.mouse.click(point.x, point.y);
    await button("Add text after block").click();
    assert.deepEqual(
      await hovered.evaluate((element) => ({
        tag: element.nextElementSibling.tagName,
        text: element.nextElementSibling.textContent,
      })),
      { tag: "P", text: "" },
      "the menu acts on the hovered block rather than the caret's paragraph",
    );
    await button("Undo").click();
  }

  await caretParagraph.click();
  const plus = await crossToRail(wrappedHeading, "Insert page content");
  assert.equal(
    await page.evaluate(() => window.getSelection()?.anchorNode?.textContent),
    "Caret stays in this paragraph.",
  );
  await page.mouse.click(plus.x, plus.y);
  await search.fill("Text");
  await insertion.getByRole("option", { name: "Text", exact: true }).click();
  assert.deepEqual(
    await wrappedHeading.evaluate((element) => ({
      tag: element.nextElementSibling.tagName,
      text: element.nextElementSibling.textContent,
    })),
    { tag: "P", text: "" },
    "the plus menu inserts after the hovered heading",
  );
  await button("Undo").click();
  await caretParagraph.click();
  await crossToRail(headingOne, "Block options");
  assert.equal(
    await page.evaluate(() => window.getSelection()?.anchorNode?.textContent),
    "Caret stays in this paragraph.",
  );
  await dragFromGrip(headingOne, body.locator(":scope > p").last());
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  await finishDrag();
  assert.equal(await body.locator(":scope > :last-child").textContent(), "Heading one");
  await button("Undo").click();
  assert.equal(await markdown(), hoverBaseline);

  await reset("Keep");
  await body.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and a much longer suffix");
  await button("Block options").click();
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await body.textContent(), "Keep");
  await button("Add text after block").click();
  assert.equal(await body.locator("p").count(), 2);
  await button("Undo").click();
  assert.equal(await body.locator("p").count(), 1);
  await reset("");

  await button("Add content").click();
  await focused(search);

  for (const group of ["Text", "Lists", "Layout", "Components"])
    await insertion.getByRole("group", { name: group, exact: true }).waitFor();
  await search.fill("Heading");
  await search.press("ArrowDown");
  await search.press("Enter");
  await body.locator("h2").waitFor();
  await focused(body);
  await page.keyboard.type("A section heading");
  assert.equal(await body.locator("h2").textContent(), "A section heading");
  await button("Add content").click();
  await search.fill("no-such-content-block");
  await page.getByText("No content blocks match your search.", { exact: true }).waitFor();
  await search.press("Escape");
  await insertion.waitFor({ state: "hidden" });
  await focused(body);
  await button("Insert page content").click();
  await search.fill("Notice");
  await search.press("Escape");
  await focused(body);

  await reset("1. First paragraph\n\n   Another paragraph");
  const nestedParagraph = body.locator("li p").first();
  await nestedParagraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /notice");
  await insertion.getByRole("option", { name: "Notice", exact: true }).click();
  await body.locator('li [data-page-component="notice"]').waitFor();
  await page.keyboard.type("Keep this notice in its list item.");
  assert.match(
    await body.locator('li [data-page-component="notice"]').textContent(),
    /Keep this notice/,
  );

  await reset("| Item | Cost |\n| --- | --- |\n| One | 1 |\n| Two | 2 |\n| Three | 3 |");
  const table = body.locator("table");
  await menuAt(table.locator("tr").nth(2).locator("td").last());
  await button("Add row").click();
  assert.equal(await table.locator("tr").count(), 5);
  assert.match(await table.locator("tr").nth(2).textContent(), /Two/);
  assert.equal(await table.locator("tr").nth(3).textContent(), "");
  assert.match(await table.locator("tr").nth(4).textContent(), /Three/);
  await button("Undo").click();
  assert.equal(await table.locator("tr").count(), 4);
  await menuAt(table.locator("tr").nth(2).locator("td").last());
  await button("Delete row").click();
  assert.equal(await table.locator("tr").count(), 3);
  assert.doesNotMatch(await table.textContent(), /Two/);
  await button("Undo").click();
  assert.match(await table.locator("tr").nth(2).textContent(), /Two/);

  await reset("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.");
  await menuAt(body.locator("p").nth(1));
  await button("Move up").click();
  assert.deepEqual(await body.locator("p").allTextContents(), [
    "Second paragraph.",
    "First paragraph.",
    "Third paragraph.",
  ]);
  await button("Undo").click();
  assert.equal(await body.locator("p").first().textContent(), "First paragraph.");
  await button("Redo").click();
  assert.equal(await body.locator("p").first().textContent(), "Second paragraph.");
  await menuAt(body.locator("p").first());
  await button("Delete block").click();
  assert.deepEqual(await body.locator("p").allTextContents(), [
    "First paragraph.",
    "Third paragraph.",
  ]);
  await button("Undo").click();
  assert.equal(await body.locator("p").first().textContent(), "Second paragraph.");
  assert.equal(await title.inputValue(), "Writer interactions");

  await reset("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.");
  const beforeDrag = await markdown();
  await dragTo(body.locator("p").first(), body.locator("p").last());
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  assert.deepEqual(await body.locator("p").allTextContents(), [
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await finishDrag();
  assert.deepEqual(await body.locator("p").allTextContents(), [
    "Second paragraph.",
    "Third paragraph.",
    "First paragraph.",
  ]);
  const afterDrag = await markdown();
  await button("Undo").click();
  assert.equal(await markdown(), beforeDrag);
  await button("Redo").click();
  assert.equal(await markdown(), afterDrag);
  await reorder(body.locator("p").last(), body.locator("p").first(), "before");
  assert.equal(await markdown(), beforeDrag);

  await dragTo(body.locator("p").first(), body.locator("p").first(), "before");
  assert.equal(await page.locator(".page-drop-line").count(), 0);
  await finishDrag();
  assert.equal(await markdown(), beforeDrag);
  await dragTo(body.locator("p").first(), body.locator("p").last());
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  // Playwright consumes Escape in its drag interceptor before it reaches the document.
  await page.keyboard.press("Escape");
  const keyboard = await context.newCDPSession(page);
  await keyboard.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await keyboard.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await keyboard.detach();
  await finishDrag();
  assert.equal(await markdown(), beforeDrag);

  await dragTo(body.locator("p").first(), body.locator("p").last());
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  await button("Preview page").evaluate((element) => element.click());
  await page.getByRole("article", { name: "Page preview" }).waitFor();
  await finishDrag();
  await button("Back to editing").click();
  assert.equal(await markdown(), beforeDrag);

  const foreignDrag = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("application/x-page-block", "unrelated-editor-node");

    return data;
  });

  await body.dispatchEvent("dragover", { dataTransfer: foreignDrag });
  await body.dispatchEvent("drop", { dataTransfer: foreignDrag });
  await foreignDrag.dispose();
  assert.equal(await markdown(), beforeDrag);

  await reset("Temporary drag source.\n\nDrop target.");
  await dragTo(body.locator("p").first(), body.locator("p").last());
  await page.locator(".page-drop-line").waitFor({ state: "visible" });
  await button("Undo").evaluate((element) => element.click());
  await page.locator("[data-page-dragging]").waitFor({ state: "hidden" });
  await finishDrag();
  assert.equal(await markdown(), beforeDrag, "undo removing the drag source cancels the move");

  await reset(
    'Before.\n\n1. First item\n   - Nested child\n2. Second item\n\n| Item | Cost |\n| --- | --- |\n| One | 1 |\n\n:::details{summary="Group summary"}\nKeep this content.\n\n- Child one\n- Child two\n:::\n\nAfter.',
  );
  const groupedBefore = await markdown();
  const groupedList = body.locator(":scope > ol");
  const groupedTable = body.locator(":scope > .page-table-scroll");
  const groupedComponent = body.locator(':scope > [data-page-component="details"]');
  const nestedItems = await groupedList.locator("li").allTextContents();
  const tableRows = await groupedTable.locator("tr").allTextContents();
  assert.equal(tableRows.length, 2);
  const componentContent = await groupedComponent.textContent();
  await reorder(groupedList, body.locator(":scope > p").last());
  assert.deepEqual(await groupedList.locator("li").allTextContents(), nestedItems);
  assert.equal(await groupedList.locator("ul").count(), 1);
  assert.equal(
    await body.locator(":scope > :last-child").evaluate((element) => element.tagName),
    "OL",
  );
  await reorder(groupedTable, body.locator(":scope > p").first(), "before");
  assert.deepEqual(await groupedTable.locator("tr").allTextContents(), tableRows);
  await reorder(groupedComponent, groupedTable, "before");
  assert.equal(await groupedComponent.textContent(), componentContent);
  assert.equal(await groupedComponent.getAttribute("data-summary"), "Group summary");
  assert.equal(await groupedComponent.locator("li").count(), 2);
  assert.equal(await title.inputValue(), "Writer interactions");
  const groupedAfter = await markdown();
  await button("Undo").click();
  await button("Undo").click();
  await button("Undo").click();
  assert.equal(await markdown(), groupedBefore);
  await button("Redo").click();
  await button("Redo").click();
  await button("Redo").click();
  assert.equal(await markdown(), groupedAfter);

  for (const marker of ["-", "1."]) {
    await reset(`${marker} One\n${marker} Two\n${marker} Three`);
    const beforeIndent = await markdown();
    await menuAt(body.getByText("Two", { exact: true }));
    await button("Indent list").click();
    const afterIndent = await markdown();
    assert.notEqual(afterIndent, beforeIndent);
    assert.equal(
      await body
        .locator("li:has(> :is(ul, ol):only-child)")
        .evaluate((element) => getComputedStyle(element).listStyleType),
      "none",
    );
    await button("Preview page").click();
    const previewList = page.locator(".page-document-preview article > :is(ul, ol)");
    assert.equal(await previewList.locator(":scope > li").count(), 2);
    assert.equal(await previewList.locator(":scope > li").first().locator("li").innerText(), "Two");
    await button("Back to editing").click();
    await button("Undo").click();
    assert.equal(await markdown(), beforeIndent);
    await button("Redo").click();
    assert.equal(await markdown(), afterIndent);
    await page.locator('[role="status"][title="Saved"]:visible').waitFor();
    await page.reload();
    await body.waitFor();
    await setPageDetailsOpen(false);
    await menuAt(body.getByText("Two", { exact: true }));
    await button("Outdent list").click();
    assert.deepEqual(await body.locator(":scope > :is(ul, ol) > li").allTextContents(), [
      "One",
      "Two",
      "Three",
    ]);
    await button("Undo").click();
    assert.equal(await markdown(), afterIndent);
  }

  await reset("| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |");
  const alignments = ["left", "center", "right", "left", "center", "right"];
  assert.deepEqual(
    await body
      .locator("th,td")
      .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign)),
    alignments,
  );
  await button("Preview page").click();
  assert.deepEqual(
    await page
      .locator(".page-document-preview th,.page-document-preview td")
      .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign)),
    alignments,
  );
  await button("Back to editing").click();

  await reset(':::actions\n::action[Continue]{href="/next" variant="primary"}\n:::');
  const actionButton = body.locator('[data-page-component="action"]');
  await menuAt(actionButton);
  await page.getByRole("combobox", { name: "Button style", exact: true }).selectOption("secondary");
  await button("Apply settings").click();
  await page.keyboard.press("Escape");
  assert.equal(
    await actionButton.evaluate((element) => element.classList.contains("page-action-secondary")),
    true,
  );

  const secondaryBackground = await actionButton.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await button("Preview page").click();
  assert.equal(
    await page
      .locator(".page-document-preview .page-action-secondary")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    secondaryBackground,
  );
  await button("Back to editing").click();
  await button("Undo").click();
  assert.equal(
    await actionButton.evaluate((element) => element.classList.contains("page-action-secondary")),
    false,
  );
  await button("Redo").click();
  assert.equal(
    await actionButton.evaluate((element) => element.classList.contains("page-action-secondary")),
    true,
  );
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await body.waitFor();
  await setPageDetailsOpen(false);
  assert.equal(
    await actionButton.evaluate((element) => getComputedStyle(element).backgroundColor),
    secondaryBackground,
  );
  await menuAt(actionButton);
  await page.getByRole("combobox", { name: "Button style", exact: true }).selectOption("primary");
  await button("Apply settings").click();
  await page.keyboard.press("Escape");
  assert.equal(
    await actionButton.evaluate((element) => element.classList.contains("page-action-secondary")),
    false,
  );

  for (const caret of ["Outside list", "Other start"]) {
    await reset(
      'Outside list\n\n1. First route\n\n   <a data-start-link href="/first">Other start</a>\n\n2. Second route\n\n   <a data-start-link href="/second">Start now</a>',
    );
    const nestedStart = body.locator('ol > li:nth-child(2) [data-page-component="start"]');
    await body.getByText(caret, { exact: true }).click();
    await hoverNestedMenu(nestedStart);
    const destination = page.getByRole("textbox", { name: "Button destination", exact: true });
    await destination.waitFor({ timeout: 5000 });
    assert.equal(await destination.inputValue(), "/second");
    await destination.fill("/edited");
    await button("Apply settings").click();
    await page.keyboard.press("Escape");
    assert.equal(await nestedStart.getAttribute("data-destination"), "/edited");
    assert.equal(
      await body
        .locator('ol > li:first-child [data-page-component="start"]')
        .getAttribute("data-destination"),
      "/first",
    );
    await nestedStart.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" online");
    const edited = await markdown();
    assert.match(edited, /<a data-start-link href="\/edited">Start now online<\/a>/);
    await page.locator('[role="status"][title="Saved"]:visible').waitFor();
    await page.reload();
    await nestedStart.waitFor();
    await setPageDetailsOpen(false);
    assert.equal(await nestedStart.textContent(), "Start now online");
    assert.equal(await nestedStart.getAttribute("data-destination"), "/edited");
  }

  await reset('<a data-start-link href="/apply">Start now</a>');
  const startButton = body.locator('[data-page-component="start"]');
  const plainStart = await markdown();
  await startButton.selectText();
  await page.keyboard.press("ControlOrMeta+b");
  await startButton.locator("strong").waitFor();
  const formattedStart = await markdown();
  assert.match(formattedStart, /<strong>Start now<\/strong>/);
  await button("Undo").click();
  assert.equal(await startButton.locator("strong").count(), 0);
  assert.equal(await markdown(), plainStart);
  await button("Redo").click();
  await startButton.locator("strong").waitFor();
  assert.equal(await markdown(), formattedStart);
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await startButton.locator("strong").waitFor();
  await setPageDetailsOpen(false);
  assert.equal(await markdown(), formattedStart);
  await button("Preview page").click();
  await page.locator(".page-document-preview a[data-start-link] strong").waitFor();
  await button("Back to editing").click();

  await reset(':::details{summary="Before"}\nSupporting information.\n:::');
  await menuAt(body.locator('[data-page-component="details"] p'));
  await page.getByRole("textbox", { name: "Details summary", exact: true }).fill("After");
  await button("Apply settings").click();
  assert.equal(
    await body.locator('[data-page-component="details"]').getAttribute("data-summary"),
    "After",
  );
  await page.keyboard.press("Escape");
  await button("Undo").click();
  assert.equal(
    await body.locator('[data-page-component="details"]').getAttribute("data-summary"),
    "Before",
  );

  assert.equal(await button("Page settings").count(), 0);
  await page.getByRole("button", { name: /^Markdown/ }).click();
  const currentSource = await source.inputValue();
  await source.fill(currentSource.replace("title: Writer interactions", "title: [unfinished"));
  await button("Apply changes").click();
  assert.equal(await source.getAttribute("aria-invalid"), "true");
  await button("Discard changes").click();

  await source.fill(
    currentSource.replace(
      "title: Writer interactions",
      "title: Writer interactions\npublish_date: 2026-99-99\ncategories: [housing, 7]",
    ),
  );
  await button("Apply changes").click();
  await button("Close source").click();
  await setPageDetailsOpen(true);
  assert.equal(await publicationDate.inputValue(), "2026-99-99");
  assert.equal(await publicationDate.getAttribute("readonly"), "");
  assert.equal(await addCategory.count(), 0);
  await description.fill("An unrelated metadata edit.");
  const unusualSource = await markdown();
  assert.match(unusualSource, /publish_date: ["']?2026-99-99/);
  assert.match(unusualSource, /categories: \[\s*housing,\s*7\s*\]/);

  const withMetadata = currentSource.replace(
    "title: Writer interactions",
    "title: Writer interactions\nlede: A short introduction.\ndescription: A page description.\ncategories:\n  - family-birth-relationships\n  - youth-and-community\nsubcategory: youth-development-leadership\n# Keep this comment\ncustom_note: Keep this metadata",
  );

  await page.getByRole("button", { name: /^Markdown/ }).click();
  await source.fill(withMetadata);
  await button("Apply changes").click();
  await button("Close source").click();
  await setPageDetailsOpen(true);
  assert.equal(await introduction.inputValue(), "A short introduction.");
  assert.equal(await description.inputValue(), "A page description.");
  assert.equal(await visibility.inputValue(), "");
  assert.equal(await addCategory.isDisabled(), true);
  await button("Remove family-birth-relationships").waitFor();
  await button("Remove youth-and-community").waitFor();
  const beforeMetadataHistory = await markdown();

  for (const field of [description, introduction, formId]) {
    const original = await field.inputValue();
    await field.fill(`${original} First edit`);
    await button("Undo").click();
    assert.equal(await field.inputValue(), original);
    await focused(field);
    await page.keyboard.press("End");
    await page.keyboard.type(" Replacement");
    assert.equal(await field.inputValue(), `${original} Replacement`);
    assert.equal(await button("Redo").isDisabled(), true, "typing clears stale redo history");
    assert.equal(await button("Undo").isEnabled(), true, "replacement typing remains undoable");
    await button("Undo").click();
    assert.equal(await field.inputValue(), original);
    await button("Redo").click();
    assert.equal(await field.inputValue(), `${original} Replacement`);
    await button("Undo").click();
    assert.equal(await field.inputValue(), original);
  }

  assert.equal(await markdown(), beforeMetadataHistory);
  await description.focus();
  await description.press("End");
  await description.pressSequentially(" Extra.");
  assert.equal(await description.inputValue(), "A page description. Extra.");
  await description.press("ControlOrMeta+z");
  assert.equal(await description.inputValue(), "A page description.");
  await description.press("ControlOrMeta+Shift+z");
  assert.equal(await description.inputValue(), "A page description. Extra.");
  await title.fill("Edited writer title");
  await description.fill("Updated page description.");
  await introduction.fill("Updated introduction.");
  await visibility.selectOption("preview");
  await publicationDate.fill("2026-10-06");
  const beforeFormId = await markdown();
  await formId.fill("writer-form");
  const editedSource = await markdown();
  assert.match(editedSource, /title: Edited writer title/);
  assert.match(editedSource, /description: ["']?Updated page description\./);
  assert.match(editedSource, /lede: ["']?Updated introduction\./);
  assert.match(
    editedSource,
    /categories:\n\s+- family-birth-relationships\n\s+- youth-and-community/,
  );
  assert.match(editedSource, /subcategory: youth-development-leadership/);
  assert.match(editedSource, /visibility: preview/);
  assert.match(editedSource, /publish_date: ["']?2026-10-06/);
  assert.match(editedSource, /form_id: writer-form/);
  assert.match(editedSource, /# Keep this comment/);
  assert.match(editedSource, /custom_note: Keep this metadata/);
  await button("Undo").click();
  assert.equal(await formId.inputValue(), "");
  assert.equal(await markdown(), beforeFormId);
  await button("Redo").click();
  assert.equal(await formId.inputValue(), "writer-form");
  assert.equal(await markdown(), editedSource);
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.reload();
  await body.waitFor();
  await setPageDetailsOpen(true);
  assert.equal(await description.inputValue(), "Updated page description.");
  assert.equal(await introduction.inputValue(), "Updated introduction.");
  assert.equal(await visibility.inputValue(), "preview");
  assert.equal(await publicationDate.inputValue(), "2026-10-06");
  assert.equal(await formId.inputValue(), "writer-form");
  assert.equal(await markdown(), editedSource);

  await button("Remove youth-and-community").click();
  assert.equal(
    await page.getByLabel("Subcategory", { exact: true }).inputValue(),
    "youth-development-leadership",
  );
  const singleCategorySource = await markdown();
  assert.match(singleCategorySource, /category: family-birth-relationships/);
  assert.doesNotMatch(singleCategorySource, /^categories:/m);
  assert.match(singleCategorySource, /subcategory: youth-development-leadership/);
  await button("Undo").click();
  assert.equal(await markdown(), editedSource);
  await button("Redo").click();
  assert.equal(await markdown(), singleCategorySource);
  await visibility.selectOption("");
  await publicationDate.fill("");
  const clearedSource = await markdown();
  assert.doesNotMatch(clearedSource, /^(visibility|publish_date):/m);

  await pageDetails.focus();
  await pageDetails.press("Enter");
  await description.waitFor({ state: "hidden" });
  await focused(pageDetails);
  await pageDetails.press("Space");
  await description.waitFor();
  await pageDetails.press("Tab");
  await focused(description);
  await button("Preview page").click();
  const metadataPreview = page.getByRole("article", { name: "Page preview" });
  await metadataPreview.getByText("Updated introduction.", { exact: true }).waitFor();
  assert.equal(await description.isVisible(), false);
  const disclosure = metadataPreview.locator("details");
  const disclosureSummary = disclosure.locator("summary");
  const disclosureContent = disclosure.getByText("Supporting information.", { exact: true });
  assert.equal(
    await disclosure.evaluate(
      (element) =>
        getComputedStyle(element).fontSize === getComputedStyle(element.parentElement).fontSize,
    ),
    true,
    "reader disclosures inherit the page's text size",
  );
  assert.equal(
    await disclosureSummary.evaluate((element) => getComputedStyle(element).display),
    "list-item",
    "reader disclosures retain the native summary marker",
  );
  assert.notEqual(
    await disclosureSummary.evaluate((element) => getComputedStyle(element).listStyleType),
    "none",
  );
  await disclosureContent.waitFor({ state: "hidden" });
  await disclosureSummary.click();
  await disclosureContent.waitFor();
  await disclosureSummary.press("Enter");
  await disclosureContent.waitFor({ state: "hidden" });
  await focused(disclosureSummary);
  await disclosureSummary.press("Space");
  await disclosureContent.waitFor();
  await button("Back to editing").click();
  assert.equal(await introduction.inputValue(), "Updated introduction.");

  await button("Add document").click();
  const documentDialog = page.getByRole("dialog");
  await documentDialog.getByLabel("Document type").selectOption("supporting");
  await documentDialog.getByLabel("Page title (optional)").fill("Other page");
  await documentDialog.getByRole("button", { name: "Add document", exact: true }).click();
  await body.waitFor();
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  await button("Add content").click();
  await search.waitFor();
  await navigation.getByRole("link", { name: "Other page", exact: true }).click();
  await search.waitFor({ state: "hidden" });
  await navigation.getByRole("link", { name: "Entry page", exact: true }).click();
  assert.equal(await search.count(), 0);
  await button("Add content").click();
  await button("Preview page").click();
  await search.waitFor({ state: "hidden" });
  await page.getByRole("article", { name: "Page preview" }).waitFor();
  assert.equal(await body.isVisible(), false);
  await button("Back to editing").click();
  await setPageDetailsOpen(true);

  await title.fill(
    "A very long service page title that must wrap without hiding any words on a narrow screen",
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await title.scrollIntoViewIfNeeded();
    assert.equal(
      await title.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      true,
    );
    assert.ok((await title.boundingBox()).height > 60);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );

    for (const field of [description, addCategory, visibility, publicationDate, formId]) {
      await insideViewport(field);
      assert.ok((await field.boundingBox()).height >= 44);
      assert.ok(
        await field.evaluate((element) => parseFloat(getComputedStyle(element).fontSize) >= 16),
      );
    }

    await insideViewport(button("Remove family-birth-relationships"));
    await button("Add content").click();
    await search.waitFor();
    await insideViewport(page.locator(".page-insert-menu"));
    await search.press("Escape");
    await menuAt(body.locator('[data-page-component="details"] p'));
    await insideViewport(page.locator(".page-block-menu"));
    await page.keyboard.press("Escape");
  }

  assert.deepEqual(errors, []);
  console.log(
    "PASS page writer: hover-only gutter targeting/alignment, insertion keyboard/focus, nested slash, selected table row, native drag preview/destination, grouped drag undo/redo, cancellation/read-only isolation, move/delete undo, component settings and styles, Start label formatting/undo/reload/preview, list hierarchy after reload/outdent, table preview alignment, metadata source validation/preservation, page details editing/undo/reload/preview/keyboard/collapse, toolbar undo typing branches, native reader disclosure styles/keyboard, hidden/preview portals and narrow layouts",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/page-writer-failure.png", fullPage: true });
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
