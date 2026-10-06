/**
 * What the compiler keeps and what it cuts. The estate's markdown leans on
 * raw HTML — Start links, show/hide details, highlight and contact cards —
 * so a sanitiser that is too strict breaks real pages as surely as one too
 * loose lets a script through.
 */

import { describe, expect, it } from "vitest";
import { compileMarkdown, hideStartLinks } from "./markdown";

const html = async (markdown: string, formId: string | null = null) =>
  JSON.stringify(await compileMarkdown(markdown, formId));

describe("compileMarkdown", () => {
  it("keeps tel: links, which every phone number in the content is", async () => {
    expect(await html("[(246) 536-3800](tel:+12465363800)")).toContain(
      '"href":"tel:+12465363800"',
    );
  });

  it("blanks a javascript: link", async () => {
    expect(await html("[x](javascript:alert(1))")).not.toContain("javascript");
  });

  it("keeps the estate's custom elements and their attributes", async () => {
    const tree = await html(
      '<highlight title="Water">Store water</highlight>\n\n' +
        '<contact label="Police" number="211" tel="tel:211"></contact>\n\n' +
        '<link-button href="/checklist.pdf" variant="secondary">Save checklist</link-button>\n\n' +
        '<details class="govbb-show-hide"><summary class="govbb-show-hide__summary">More</summary></details>',
    );

    expect(tree).toContain('"tagName":"highlight"');
    expect(tree).toContain('"title":"Water"');
    expect(tree).toContain('"tagName":"contact"');
    expect(tree).toContain('"number":"211"');
    expect(tree).toContain('"tagName":"link-button"');
    expect(tree).toContain('"href":"/checklist.pdf"');
    expect(tree).toContain('"variant":"secondary"');
    expect(tree).toContain('"className":["govbb-show-hide"]');
  });

  it("blanks a javascript: href on a link-button", async () => {
    expect(
      await html('<link-button href="javascript:alert(1)">x</link-button>'),
    ).not.toContain("javascript");
  });

  it("gives headings v1's slug ids, without a clobber prefix", async () => {
    expect(await html("## Make a payment")).toContain('"id":"make-a-payment"');
  });

  it("keeps an authored heading id", async () => {
    expect(await html('<h2 id="fees">Fees and costs</h2>')).toContain(
      '"id":"fees"',
    );
  });

  it("stamps a href-less start link with the form, and leaves an authored href alone", async () => {
    const tree = await compileMarkdown(
      '<a data-start-link>Start now</a> <a data-start-link href="/x/start">Apply</a>',
      "a-form",
    );
    const links = JSON.stringify(tree);

    expect(links).toContain('"dataFormId":"a-form"');
    expect(links.match(/dataFormId/g)).toHaveLength(1);
  });

  it("keeps no source positions", async () => {
    expect(await html("# Title")).not.toContain("position");
  });
});

describe("hideStartLinks", () => {
  it("drops a bare start link and leaves the tree it was given untouched", async () => {
    const tree = await compileMarkdown(
      "Before\n\n<a data-start-link>Start</a>",
      null,
    );
    const before = JSON.stringify(tree);

    const hidden = hideStartLinks(tree);

    expect(JSON.stringify(hidden)).not.toContain("dataStartLink");
    expect(JSON.stringify(hidden)).toContain("Before");
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("counts a word-spelled number of ways down", async () => {
    const tree = await compileMarkdown(
      "There are three ways to apply:\n\n- online <a data-start-link>here</a>\n- by post\n- in person",
      null,
    );

    expect(JSON.stringify(hideStartLinks(tree))).toContain(
      "There are 2 ways to apply:",
    );
  });

  it("returns a tree with no start link as it is", async () => {
    const tree = await compileMarkdown("There are 2 ways to apply.", null);
    expect(hideStartLinks(tree)).toBe(tree);
  });
});
