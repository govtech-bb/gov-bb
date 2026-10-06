import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { $pageButtons } from "../../src/forms/features/pages/buttons";
import { $pagePreview } from "../../src/forms/features/pages/queries";
import { $native } from "../../src/forms/editor/native-state";

test("calculator result previews retain their purpose and native navigation labels", () => {
  const imported = formSchemaToLexical(
    {
      schemaVersion: 2,
      id: "page-preview",
      title: "Page preview",
      mode: "calculator",
      locale: "en-BB",
      timeZone: "America/Barbados",
      settings: { visibility: "preview", hiddenAnswers: "retain" },
      blocks: [
        { id: "first", type: "page", role: "questions", title: "Details" },
        { id: "amount", type: "question", kind: "number", key: "amount", label: "Amount" },
        {
          id: "second",
          type: "page",
          role: "questions",
          title: "More details",
          navigation: { nextLabel: "Calculate", backLabel: "Back to details" },
        },
        { id: "description", type: "content", kind: "paragraph", content: "Review the amount." },
        { id: "result", type: "page", role: "result", title: "Your estimate" },
        { id: "summary", type: "content", kind: "paragraph", content: [{ answer: "amount" }] },
      ],
    },
    govbbFormEditor,
  );

  if (imported.status !== "ready") throw Error(JSON.stringify(imported.diagnostics));
  const editor = createHeadlessEditor(govbbFormEditor, imported.state);

  try {
    editor.read(() => {
      const result = $getRoot()
        .getChildren()
        .find((node) => $native(node).page?.role === "result")!;

      expect($pagePreview(result)).toMatchObject({ type: "result", qualified: false });
      const buttons = $pageButtons();
      expect(buttons.map((button) => button.label)).toEqual(["Continue", "Calculate"]);
      expect(buttons[1]!.backLabel).toBe("Back to details");
      expect(buttons.some((button) => button.key === result.getKey())).toBe(false);
    });
  } finally {
    editor.dispose();
  }
});
