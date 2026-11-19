import { expect, test } from "vitest";
import { rankActions } from "../../src/editor/core/actions";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbPageEditor } from "../../src/presets/govbb-page";

const page = (query: string) =>
  rankActions(query, govbbPageEditor.actions).map((action) => action.title);

test("the words writers use find the block they mean first", () => {
  expect(page("h2")[0]).toBe("Heading 2");
  expect(page("##")[0]).toBe("Heading 2");
  expect(page("divider")[0]).toBe("Separator");
  expect(page("callout")[0]).toBe("Notice");
  expect(page("bl")[0]).toBe("Bulleted list");
  expect(page("start")[0]).toBe("Start button");
});

test("a search ranks one list: title starts before words inside, and ties keep the menu's order", () => {
  expect(page("heading")).toEqual(["Heading 2", "Heading 3", "Heading 4"]);
  expect(page("list").slice(0, 2)).toEqual(["Bulleted list", "Numbered list"]);
});

test("with nothing typed, a menu lists its blocks in order, without those only a search finds", () => {
  const listed = page("");
  expect(listed).not.toContain("Heading 4");
  expect(listed).toEqual(
    govbbPageEditor.actions.filter((action) => !action.searchOnly).map((action) => action.title),
  );
});

test("one or two letters find names, not letters in the middle of words or descriptions", () => {
  expect(page("ti")).not.toContain("Notice");
  expect(page("tic")).toContain("Notice");
});

test("a search finds a block by its description and keywords too, after its name", () => {
  expect(page("quotation")).toEqual(["Quote"]);
  expect(
    rankActions("Team blocks", govbbFormEditor.actions).every(
      (action) => action.group === "Form registry",
    ),
  ).toBe(true);
});

test("field pickers rank the same way, ignoring case and accents", () => {
  const fields = [
    { title: "Date of birth" },
    { title: "Café opening hours" },
    { title: "Birth country" },
  ];

  expect(rankActions("birth", fields).map((field) => field.title)).toEqual([
    "Birth country",
    "Date of birth",
  ]);
  expect(rankActions("cafe", fields).map((field) => field.title)).toEqual(["Café opening hours"]);
});
