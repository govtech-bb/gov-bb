import { readFileSync } from "node:fs";
import { $getRoot, $parseSerializedNode } from "lexical";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { govbbFormEditor } from "../../src/presets/govbb-form";

// Frozen legacy evidence keeps compatibility assertions independent of the native demo catalog.
const dialect = createFormSourceDialect(
  govbbFormEditor.fields.map((field) => field.source),
  govbbFormEditor.contents.map((content) => content.source),
);

const original = readFileSync(
  new URL("../fixtures/forms/demo.canonical.md", import.meta.url),
  "utf8",
);

const document = dialect.readMarkdown(original).document!;

export function $legacyDemo() {
  $getRoot().append(
    ...dialect.toEditor(document).root.children.map((node) => $parseSerializedNode(node)),
  );
}
