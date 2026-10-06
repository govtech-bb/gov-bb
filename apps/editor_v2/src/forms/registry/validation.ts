import type { FormEditorDefinition } from "../definition";
import {
  nativeCapabilityMatches,
  validateFormDefinition,
  visitNativeReferences,
  type AnyFormBlock,
  type AnyFormDefinition,
  type NativeReference,
} from "../schema";
import type { FormRegistryEntry } from "./definition";

/** The native envelope supplies only semantic scope; fragment lowering never creates editor pages. */
export function registryDocument(entry: FormRegistryEntry): AnyFormDefinition {
  if (entry.scope === "form") return structuredClone(entry.form);

  const ids = new Set<string>(),
    pending = [...entry.blocks];

  while (pending.length) {
    const block = pending.pop()!;

    if (ids.has(block.id)) continue;
    ids.add(block.id);

    if (block.type === "question" && Array.isArray(block.hint))
      pending.push(
        ...block.hint.flatMap((item) =>
          typeof item === "object" && "type" in item && item.type === "content" ? [item] : [],
        ),
      );

    if (block.type === "content" && block.kind === "expandable") {
      const config = block.config;

      if (
        config &&
        typeof config === "object" &&
        "blocks" in config &&
        Array.isArray(config.blocks)
      )
        pending.push(...config.blocks);
    }
  }

  let envelopeId = "registry-envelope";

  while (ids.has(envelopeId)) envelopeId += "-page";

  return {
    schemaVersion: 2,
    id: "registry-template",
    title: entry.title,
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [
      ...(entry.scope === "fragment"
        ? [
            {
              id: envelopeId,
              type: "page" as const,
              role: "questions" as const,
              title: "Registry fragment",
            },
          ]
        : []),
      ...structuredClone(entry.blocks),
    ],
  };
}

export function validateRegistryEntry(
  entry: FormRegistryEntry,
  definition: FormEditorDefinition,
): void {
  const form = registryDocument(entry),
    external = new Set(entry.externalReferences ?? []),
    externalPaths = new Set<string>();

  const reference = (ref: NativeReference) => {
    if (external.has(ref.id) || (ref.ownerId && external.has(ref.ownerId)))
      externalPaths.add(JSON.stringify(ref.path));

    return ref.id;
  };

  visitNativeReferences(form, reference);

  const visit = (block: AnyFormBlock, path: (string | number)[]) => {
    if (block.type === "question") {
      definition.nativeFields
        .find((field) => nativeCapabilityMatches(field.native!, block))
        ?.native?.references?.(block, (ref) => reference({ ...ref, path: [...path, ...ref.path] }));

      if (Array.isArray(block.hint))
        block.hint.forEach((child, index) => {
          if (typeof child === "object" && "type" in child && child.type === "content")
            visit(child, [...path, "hint", index]);
        });
    } else if (block.type === "content") {
      definition.nativeContents
        .find(
          (content) =>
            content.native?.blockType === "content" &&
            nativeCapabilityMatches(content.native, block),
        )
        ?.native?.references?.(block, (ref) => reference({ ...ref, path: [...path, ...ref.path] }));

      const config = block.config;

      if (
        block.kind === "expandable" &&
        config &&
        typeof config === "object" &&
        "blocks" in config &&
        Array.isArray(config.blocks)
      )
        config.blocks.forEach((child, index) => visit(child, [...path, "config", "blocks", index]));
    }
  };

  form.blocks.forEach((block, index) => visit(block, ["blocks", index]));
  const result = validateFormDefinition(form, definition.nativeCapabilities);

  const issues = result.diagnostics.filter(
    (issue) =>
      !(
        externalPaths.has(JSON.stringify(issue.path)) &&
        ["reference-missing", "reference-option", "reference-list-item"].includes(issue.code)
      ),
  );

  if (issues.length)
    throw new Error(`Registry ${entry.key}: ${issues[0]!.message} at ${issues[0]!.path.join(".")}`);
}
