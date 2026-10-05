import { createHash } from "node:crypto";
import type { LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import type { FormEditorDefinition } from "../../src/forms/definition";
import type { Setting, Settings } from "../../src/forms/core/settings";
import { remapKnownSettings } from "../../src/forms/core/references";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import { $blockKind, $depth, $formBlocks, $settings } from "../../src/forms/editor/nodes";

type Raw = { type: string; $?: { id?: string; settings?: Settings }; children?: Raw[] };

/** Normalize declared identities and known reference positions only; submitted values and prose stay literal. */
export function registrySnapshot(editor: LexicalEditor, definition: FormEditorDefinition) {
  const state = structuredClone(editor.getEditorState().toJSON());

  const nodes: Raw[] = state.root.children;

  const blockAliases = new Map<string, string>(),
    aliases = new Map<string, string>(),
    choices = new Set<string>();

  let field = 0,
    condition = 0,
    action = 0;

  nodes.forEach((node, index) => {
    if (node.$?.id) {
      blockAliases.set(node.$.id, `block-${index + 1}`);
      aliases.set(node.$.id, `block-${index + 1}`);
    }
  });

  for (const node of nodes) {
    const settings = node.$?.settings;

    if (typeof settings?.field === "string") {
      if (!aliases.has(settings.field) || !aliases.get(settings.field)!.startsWith("question-"))
        aliases.set(settings.field, `question-${++field}`);

      if (node.type === "option") choices.add(settings.field);
    }

    const conditions = (rows: Setting | undefined) => {
      if (Array.isArray(rows))
        for (const row of rows) {
          if (row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string")
            aliases.set(row.id, `condition-${++condition}`);

          if (row && typeof row === "object" && !Array.isArray(row)) conditions(row.conditionals);
        }
    };

    conditions(settings?.conditionals);

    if (Array.isArray(settings?.actions))
      for (const row of settings.actions)
        if (row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string")
          aliases.set(row.id, `action-${++action}`);
  }

  for (const node of nodes) {
    if (node.$?.id) node.$.id = blockAliases.get(node.$.id)!;

    if (!node.$?.settings) continue;

    const settings = remapKnownSettings(node.$.settings, aliases, {
      choiceFields: choices,
      optionAliases: blockAliases,
    });

    if (typeof settings.field === "string")
      settings.field = aliases.get(settings.field) ?? settings.field;
    // Source anchors and explicit-attribute bookkeeping are freshly assigned on either insertion path.
    delete settings.sourceKey;
    delete settings.sourceExplicit;

    const conditions = (rows: Setting | undefined) => {
      if (Array.isArray(rows))
        for (const row of rows) {
          if (row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string")
            row.id = aliases.get(row.id) ?? row.id;

          if (row && typeof row === "object" && !Array.isArray(row)) conditions(row.conditionals);
        }
    };

    conditions(settings.conditionals);

    if (Array.isArray(settings.actions))
      for (const row of settings.actions)
        if (row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string")
          row.id = aliases.get(row.id) ?? row.id;
    node.$.settings = settings;
  }

  const normalized = createHeadlessEditor(definition, state, {
    prepare: false,
  });

  try {
    return {
      nodes: normalized.read(() =>
        $formBlocks().map((node) => ({
          kind: $blockKind(node),
          text: node.getTextContent(),
          depth: $depth(node),
          settings: $settings(node),
        })),
      ),
      output: lexicalToLegacySsb(normalized.getEditorState(), definition, normalized),
    };
  } finally {
    normalized.dispose();
  }
}

export const registryFingerprint = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      ),
    )
    .digest("hex");
