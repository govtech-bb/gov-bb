import { expect, test } from "vitest";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor";
import { defineFormEditor } from "../../src/forms";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { $turnInto, $turnIntoGroups } from "../../src/forms/editor/nodes";

test("Turn into preserves content order and cannot construct removed content modules", () => {
  const full = createHeadlessEditor(defineFormEditor({ modules: govbbFormModules }));

  const reduced = createHeadlessEditor(
    defineFormEditor({
      modules: govbbFormModules.filter((module) => module.key !== "callouts" && !module.registry),
    }),
  );

  try {
    full.read(() =>
      expect($turnIntoGroups()[2]?.map(([kind]) => kind)).toEqual([
        "paragraph",
        "question",
        "h1",
        "h2",
        "h3",
        "bullet",
        "number",
        "inset",
        "warning",
        "show-hide",
      ]),
    );
    reduced.update(
      () => {
        expect($turnIntoGroups()[2]?.map(([kind]) => kind)).toEqual([
          "paragraph",
          "question",
          "h1",
          "h2",
          "h3",
          "bullet",
          "number",
          "show-hide",
        ]);
        const line = $createParagraphNode().append($createTextNode("Keep this text"));
        $getRoot().clear().append(line);
        $turnInto(line, "warning");
        expect($getRoot().getFirstChild()).toBe(line);
        $turnInto(line, "bullet");
        expect($getRoot().getFirstChild()?.getType()).toBe("bullet");
        expect($getRoot().getTextContent()).toBe("Keep this text");
      },
      { discrete: true },
    );
  } finally {
    full.dispose();
    reduced.dispose();
  }
});
