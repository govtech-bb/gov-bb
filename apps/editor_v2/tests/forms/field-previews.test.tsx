/** @vitest-environment jsdom */
import { $getRoot } from "lexical";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { EditorComposer } from "../../src/editor/react/composer";
import { RendererHost } from "../../src/editor/react/contributions";
import type { FieldPreviewProps } from "../../src/forms/editor/field-module";
import { $blockKind } from "../../src/forms/editor/nodes";
import { markBlocks } from "../../src/forms/editor/structure/projection";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { prepareSource } from "../helpers/default-form";

const source = `---
format: "govbb-form"
formatVersion: 2
title: "Every drawn field"
---

# Every drawn field

::page{#first}

::text[Reference]{#reference required mask="999999-9999"}

::email[Email address]{#email required}

::phone[Phone number]{#phone required}

::time[Closing time]{#time required}

::number[Employees]{#employees required}

::long-answer[Tell us more]{#more required}

::date[Date of birth]{#birth required}

::boolean[Do you agree]{#agree required}

::address-lookup[Your address]{#address required}

::checkboxes[Which apply]{#which required}
- :option[First]{#first-option optionValue="first"}
- :option[Second]{#second-option optionValue="second"}

::multiple-choice[Pick one]{#pick required}
- :option[Yes]{#yes optionValue="yes"}
- :option[No]{#no optionValue="no"}

::dropdown[Which parish]{#parish required}
- :option[Christ Church]{#christ-church optionValue="Christ Church"}
- :option[Saint Michael]{#saint-michael optionValue="Saint Michael"}
`;

// What each preview is given: the registry's samples, here the canvas's own
const samples = new Map<string, FieldPreviewProps>([
  ["text", { mask: "999999-9999" }],
  ["checkboxes", { options: ["First", "Second"] }],
  ["multiple-choice", { options: ["Yes", "No"] }],
  ["dropdown", { options: ["Christ Church", "Saint Michael"] }],
]);

// What each field draws: a box, the date's parts, each option's marker and a select
const drawn = "[data-drawn], [data-date], [data-marker], [data-select]";

const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const done of cleanup.splice(0)) done();
  vi.unstubAllGlobals();
});

/** The drawn controls an element shows, without the "(optional)" mark that only an optional question shows. */
function drawings(element: Element) {
  return [...element.querySelectorAll<HTMLElement>(drawn)].flatMap((control) => {
    if (control.hidden || control.parentElement?.closest(drawn)) return [];
    const copy = control.cloneNode(true);

    if (!(copy instanceof HTMLElement)) throw Error("A drawing is an element");
    copy.querySelector("[data-optional]")?.remove();

    return [copy.outerHTML];
  });
}

// A question's width only applies when it is short or medium (index.css)
const applied = (width?: string) => (width === "short" || width === "medium" ? width : undefined);

/** Each field's blocks on the form canvas, as Lexical draws them, with the question's widths marked. */
function canvas() {
  const editor = createHeadlessEditor(govbbFormEditor, prepareSource(source).state);
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

  const blocks = new Map<string, HTMLElement[]>();

  editor.read(() => {
    for (const block of $getRoot().getChildren()) {
      const dom = editor.getElementByKey(block.getKey());
      const kind = $blockKind(block);

      if (dom && dom.querySelector(drawn)) blocks.set(kind, [...(blocks.get(kind) ?? []), dom]);
    }
  });

  return blocks;
}

/** Each field's insert preview, as the dialog renders it. */
async function previews(kinds: readonly string[]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  cleanup.push(() => {
    act(() => root.unmount());
    host.remove();
  });

  await act(async () =>
    root.render(
      <EditorComposer definition={govbbFormEditor} initialState={prepareSource(source).state}>
        {kinds.map((kind) => (
          <section key={kind} data-preview={kind}>
            <RendererHost name={`field-preview:${kind}`} props={samples.get(kind) ?? {}} />
          </section>
        ))}
      </EditorComposer>,
    ),
  );

  return new Map(
    kinds.map((kind) => [kind, host.querySelector<HTMLElement>(`[data-preview="${kind}"]`)!]),
  );
}

test("the insert dialog previews each field with the form canvas's own drawing, at its width", async () => {
  const blocks = canvas();

  expect([...blocks.keys()]).toEqual([
    "text",
    "email",
    "phone",
    "time",
    "number",
    "long-answer",
    "date",
    "boolean",
    "address-lookup",
    "checkboxes",
    "multiple-choice",
    "dropdown",
  ]);

  const shown = await previews([...blocks.keys()]);

  for (const [kind, doms] of blocks) {
    const preview = shown.get(kind)!;

    expect(drawings(preview), kind).toEqual(doms.flatMap(drawings));
    expect(applied(preview.querySelector<HTMLElement>("[data-width]")?.dataset.width), kind).toBe(
      applied(doms[0]!.dataset.width),
    );
  }

  expect(applied(blocks.get("time")![0]!.dataset.width)).toBe("short");
});
