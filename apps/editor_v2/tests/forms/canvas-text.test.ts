/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { $getRoot } from "lexical";
import { afterEach, expect, test } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { container } from "../../src/editor/react/block-dom";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { $isOptionNode } from "../../src/forms/editor/nodes";
import { markBlocks } from "../../src/forms/editor/structure/projection";
import type { QuestionBase } from "../../src/forms/schema/types";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { emptyNativeForm } from "../helpers/native-form";

const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

/** The form's canvas DOM, as Lexical draws it, with block states projected. */
function canvas(questions: QuestionBase[]) {
  const imported = formSchemaToLexical(
    { ...emptyNativeForm, blocks: [...emptyNativeForm.blocks, ...questions] },
    govbbFormEditor,
  );

  if (imported.status !== "ready") throw Error(imported.diagnostics[0]?.message);
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.append(root);
  editor.setRootElement(root);
  const stop = markBlocks(editor);
  editor.update(() => $getRoot().getLastChild()!.markDirty(), { discrete: true });
  cleanup.push(() => {
    stop();
    editor.dispose();
    root.remove();
  });

  return { editor, root };
}

const email: QuestionBase = {
  id: "email",
  type: "question",
  kind: "email",
  key: "email",
  label: "Email address",
  disabled: true,
};

const colour: QuestionBase = {
  id: "colour",
  type: "question",
  kind: "choice",
  key: "colour",
  label: "Colour",
  config: { selection: "single", presentation: "radio" },
  options: [
    { id: "red", value: "red", label: "Red" },
    { id: "blue", value: "blue", label: "Blue" },
  ],
  parts: { label: { visible: false } },
};

const birth: QuestionBase = {
  id: "birth",
  type: "question",
  kind: "date",
  key: "birth",
  label: "Date of birth",
  visible: false,
};

const answers = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("[data-answer]")].flatMap((answer) =>
    answer.hidden ? [] : [[answer.textContent, answer.getAttribute("aria-hidden")]],
  );

test("each drawn answer says what it is to a screen reader, and a choice says it once", () => {
  const { editor, root } = canvas([email, colour, birth]);

  expect(answers(root)).toEqual([
    ["Answer: Email address", "false"],
    ["Answer: Radios", "false"],
    ["Answer: Date input", "false"],
  ]);

  // When the first option goes, the next one takes its place
  editor.update(() => $getRoot().getChildren().find($isOptionNode)!.remove(), { discrete: true });
  expect(answers(root)[1]).toEqual(["Answer: Radios", "false"]);
  expect(root.querySelectorAll("[data-option] > [data-answer]:not([hidden])")).toHaveLength(1);
});

test("Hidden and Disabled are words on the canvas, read out, with tips that open with the caret", () => {
  const { root } = canvas([email, colour, birth]);

  const disabled = root.querySelector<HTMLElement>("[data-disabled-tag]")!;
  expect(disabled.firstChild?.textContent).toBe("Disabled");
  expect(disabled.getAttribute("aria-hidden")).toBe("false");
  expect(disabled.hasAttribute("title")).toBe(false);
  expect(disabled.textContent).toContain("People cannot answer this field");

  // Shown beside a question label hidden on the page (data-label-hidden, from markPageHeads)
  const label = root.querySelector<HTMLElement>("h2 > .state-tag")!;
  expect(label.firstChild?.textContent).toBe("Hidden");
  expect(label.getAttribute("aria-hidden")).toBe("false");

  // A block nobody sees yet keeps its contrast and says Hidden (state-tag in index.css)
  const hidden = root.querySelectorAll<HTMLElement>("[data-hidden]");
  expect(hidden.length).toBeGreaterThan(0);
  expect([...hidden].every((block) => block.className.includes(container))).toBe(true);
  expect(container).toContain("data-hidden:after:content-['Hidden']");
  expect(container).toContain("data-hidden:after:state-tag");
  expect(container).not.toContain("bg-white/70");

  // Every canvas tip opens on hover and while its block holds the caret
  const tips = [...root.querySelectorAll<HTMLElement>(".group\\/tip > span")];
  expect(tips.length).toBeGreaterThan(2);

  for (const tip of tips) expect(tip.className).toContain("in-data-current:visible");
});

/** WCAG's relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (light! + 0.05) / (dark! + 0.05);
};

test("a selected block's edge stands out at 3:1 or more from the page and the highlight", () => {
  const tokens = readFileSync(
    createRequire(import.meta.url).resolve("@govtech-bb/frontend/tokens.css"),
    "utf8",
  );

  const token = (name: string) =>
    new RegExp(`--govbb-${name}:\\s*(#[0-9a-f]{6})`).exec(tokens)![1]!;

  expect(container).toContain("data-selected:shadow-");
  expect(container).toContain("-15px_0_0_var(--color-blue-40)");
  expect(contrast(token("blue-40"), "#ffffff")).toBeGreaterThanOrEqual(3);
  expect(contrast(token("blue-40"), token("blue-10"))).toBeGreaterThanOrEqual(3);
});
