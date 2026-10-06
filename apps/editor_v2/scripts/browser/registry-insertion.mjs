import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserFixture } from "./build-fixture.mjs";
import { chromium } from "./playwright.mjs";

const directory = await mkdtemp(join(tmpdir(), "lexical-registry-")),
  bundle = join(directory, "registry.js");

let browser, page;

try {
  await buildBrowserFixture("tests/browser/registry-insertion.tsx", bundle);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error);
  });
  await page.route("https://registry-insertion.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><style>body{font-family:sans-serif;padding:30px}[contenteditable]{min-height:80px;border:1px solid #888;padding:20px}p{min-height:24px}button{margin:5px}svg{width:20px;height:20px}[role=listbox]{background:white;border:1px solid #888;padding:10px}nav{position:fixed;inset-block-start:0;inset-inline:0;background:white;z-index:100}body{padding-block-start:70px}[data-folded],[data-page-folded]{display:none}[role=dialog]{position:fixed;inset:80px 15vw;overflow:auto;background:white;border:2px solid #555;padding:24px;z-index:200}</style></head><body><main id="app"></main></body></html>',
    }),
  );

  const mount = async () => {
    await page.addScriptTag({ path: bundle });
    await page.waitForFunction(() => window.registryInsertionFixture?.ready());
  };

  await page.goto("https://registry-insertion.test/");
  await mount();
  const state = () => page.evaluate(() => window.registryInsertionFixture.state());
  const source = () => page.evaluate(() => window.registryInsertionFixture.source());

  const count = (n) =>
    page.waitForFunction(
      (n) =>
        window.registryInsertionFixture
          .schema()
          .blocks.filter((block) => block.type === "question" && block.key.startsWith("country"))
          .length === n,
      n,
    );

  const baseline = await state();
  const canvas = page.getByRole("textbox", { name: "Registry form", exact: true });
  await canvas.locator(":scope > p").last().click();
  await page.keyboard.type("/Address with country");
  const option = page.getByRole("option", { name: "Address with country", exact: true });
  await option.waitFor();
  await option.click();
  await count(1);
  assert.equal(
    await canvas.textContent().then((text) => text.includes("/Address with country")),
    false,
    "successful insertion consumes the slash trigger",
  );
  const one = await state();
  await page.getByRole("button", { name: "Open insert modal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Insert a block", exact: true });
  await dialog
    .getByRole("combobox", { name: "Search blocks", exact: true })
    .fill("Address with country");
  assert.match(await dialog.innerText(), /Address line 2/);
  assert.match(await dialog.innerText(), /Parish/);
  await dialog.getByRole("option", { name: "Address with country", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await count(2);

  const two = await state(),
    saved = await source();

  const output = await page.evaluate(() => window.registryInsertionFixture.schema());
  const questions = output.blocks.filter((block) => block.type === "question");
  const countries = questions.filter((question) => question.key.startsWith("country"));
  assert.deepEqual(
    countries.map((question) => question.key),
    ["country", "country_2"],
  );
  assert.notEqual(countries[0].id, countries[1].id);
  assert.equal(
    countries[0].options.some((option) =>
      countries[1].options.some((other) => other.id === option.id),
    ),
    false,
  );

  for (const country of countries)
    assert.equal(country.options.find((option) => option.label === "Barbados").value, "barbados");
  questions
    .filter((question) => question.key.startsWith("parish"))
    .forEach((parish, index) => {
      const country = countries[index],
        option = country.options.find((option) => option.value === "barbados");

      assert.deepEqual(parish.layout, { under: { question: country.id, option: option.id } });
      const logic = output.blocks.filter((block) => block.type === "logic")[index];
      assert.deepEqual(logic.rules[0].when, {
        op: "selected",
        question: country.id,
        option: option.id,
      });
      assert.ok(logic.rules[0].actions[0].targets.includes(parish.id));
    });

  await page.getByRole("button", { name: "Undo insertion", exact: true }).click();
  await count(1);
  assert.deepEqual(await state(), one, "one undo removes the entire second composite");

  const beforeFailure = await state(),
    selection = await page.evaluate(() => window.registryInsertionFixture.selection());

  await page.getByRole("button", { name: "Reject external reference", exact: true }).click();
  assert.match(
    await page.getByLabel("Insertion error", { exact: true }).textContent(),
    /Unknown answer reference/,
  );
  assert.equal(await page.evaluate(() => window.registryInsertionFixture.removedTrigger()), false);
  assert.deepEqual(
    await state(),
    beforeFailure,
    "rejected insertion leaves all document bytes intact",
  );
  assert.deepEqual(
    await page.evaluate(() => window.registryInsertionFixture.selection()),
    selection,
    "rejected insertion preserves the selection",
  );
  await page.getByRole("button", { name: "Redo insertion", exact: true }).click();
  await count(2);
  assert.deepEqual(
    await state(),
    two,
    "rejection preserves the redo branch and its exact identities",
  );

  await page.getByRole("button", { name: "Save source", exact: true }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("registry-insertion-fixture")),
    saved,
  );
  await page.reload();
  await mount();
  await count(2);
  assert.equal(await source(), saved, "canonical source survives a real page reload exactly");
  assert.deepEqual(errors, []);
  assert.ok(baseline.root.children.length < two.root.children.length);
  console.log(
    "PASS registry slash/modal insertion and preview; independent composites and literal values; one-step undo/redo; rejected insertion preserves document/selection/redo; canonical reload; no browser errors",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    console.error((await page.locator("body").innerText()).slice(-6500));
    await page.screenshot({ path: "/tmp/registry-insertion-failure.png" });
  }

  throw error;
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
