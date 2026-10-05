import { $getEditor } from "lexical";
import type { ReactNode } from "react";
import { editorDefinition } from "../../editor/core/context";
import { formDefinition } from "../definition";
import type { FormModule } from "../field";
import {
  defineFormRegistry,
  type FormRegistry,
  type FormRegistryEntry,
} from "../registry/definition";
import { validateRegistryEntry } from "../registry/validation";
import { $finishFollowUp, focusLogic } from "../features/logic/authoring";
import { $insertBlocks } from "./insertion";
import { $canInsertFormAction } from "./insertion-context";
import { $addFollowUp } from "./nesting";
import { $depth, $isOptionNode, $isPageBreak } from "./nodes";
import { $instantiateRegistryEntry, prepareRegistryEntry } from "./registry";

export function FormRegistryModule(
  registry: FormRegistry,
  options: { key?: string; preview?: (entry: FormRegistryEntry) => ReactNode } = {},
): FormModule {
  const { entries } = defineFormRegistry(registry.entries);

  return {
    key: options.key ?? "form-registry",
    requires: ["form"],
    registry: entries,
    validateDefinition: (definition) => {
      for (const entry of entries) validateRegistryEntry(entry, definition);
    },
    actions: entries
      .filter((entry) => entry.scope !== "form")
      .map((entry, index) => ({
        id: entry.key,
        title: entry.title,
        description: entry.description,
        icon: entry.icon,
        group: "Form registry",
        order: 2000 + index,
        keywords: `${entry.keywords ?? ""} Form registry Team blocks GovBB fields`,
        preview: options.preview?.(entry),
        $available: (context) => {
          if (!$canInsertFormAction(context, "registry")) return false;

          if (
            entry.scope === "page" &&
            (context.request.mode === "follow-up" ||
              !context.target ||
              $depth(context.target) !== 0 ||
              (context.target.getNextSibling() && !$isPageBreak(context.target.getNextSibling())))
          )
            return false;

          try {
            validateRegistryEntry(entry, formDefinition(editorDefinition(context.editor)));

            return true;
          } catch {
            return false;
          }
        },
        $prepare: ({ editor, target, request }) => {
          const definition = formDefinition(editorDefinition(editor));

          const created = $instantiateRegistryEntry(
            prepareRegistryEntry(entry, definition),
            target,
          );

          return () => {
            const option = request.mode === "follow-up" && $isOptionNode(target) ? target : null;
            const into = option ? $addFollowUp(option) : target;
            $insertBlocks(created, into, { trailingParagraph: entry.trailingParagraph });
            const rule = option ? $finishFollowUp(option, created) : undefined;

            return rule ? { afterClose: () => focusLogic(editor, rule) } : undefined;
          };
        },
      })),
  };
}

/** Template creation for an explicitly configured host's initial document. */
export function $registryBlocks(key: string) {
  const definition = formDefinition(editorDefinition($getEditor()));
  const entry = definition.registry.find((entry) => entry.key === key);

  if (!entry) throw new Error(`Unregistered Form registry entry: ${key}`);

  if (entry.scope === "form")
    throw new Error(`Registry ${key}: complete forms must be created by the host`);

  return $instantiateRegistryEntry(prepareRegistryEntry(entry, definition));
}
