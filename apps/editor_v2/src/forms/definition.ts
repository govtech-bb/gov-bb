import { validateContentSyntax } from "./source/content";
import { defineFormRegistry } from "./registry/definition";
import { defineEditor, type EditorDefinition } from "../editor/core/definition";
import type { FormModule } from "./field";
import type { DocumentNodeDefinition } from "../editor/core/module";
import { validateNativeCapabilities } from "./schema";
import type { NativeSchemaCapabilities } from "./schema";

export type { FormModule } from "./field";

export function defineFormEditor({
  modules,
  namespace = "govbb-form",
}: {
  modules: readonly FormModule[];
  namespace?: string;
}) {
  const registry = defineFormRegistry(modules.flatMap((module) => module.registry ?? [])).entries;

  const logicActions = Object.freeze(
    modules
      .flatMap((module) => module.logicActions ?? [])
      .map((action) => Object.freeze({ ...action }))
      .sort((a, b) => a.order - b.order),
  );

  if (new Set(logicActions.map((action) => action.type)).size !== logicActions.length)
    throw new Error("Duplicate logic action definition");

  const structural = Object.freeze(
    modules
      .flatMap((module) => module.structural ?? [])
      .map((claim) => Object.freeze({ ...claim, storage: Object.freeze({ ...claim.storage }) })),
  );

  const fields = Object.freeze(modules.flatMap((module) => module.fields ?? []));
  const contents = Object.freeze(modules.flatMap((module) => module.contents ?? []));
  const nativeFields = Object.freeze(fields.filter((field) => field.native));
  const nativeContents = Object.freeze(contents.filter((content) => content.native));

  const contribution = <K extends "pageRoles" | "actions" | "operators" | "formats">(key: K) => {
    const values = modules.flatMap((module) => module.nativeCapabilities?.[key] ?? []);

    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate native ${key} contribution`);

    return Object.freeze(values);
  };

  const nativeFeatures = Object.freeze({
    pageRoles: contribution("pageRoles"),
    actions: contribution("actions"),
    operators: contribution("operators"),
    formats: contribution("formats"),
  });

  const nativeCapabilities: NativeSchemaCapabilities = Object.freeze({
    ...nativeFeatures,
    fields: Object.freeze(nativeFields.map((field) => field.native!)),
    contents: Object.freeze(
      nativeContents
        .filter((content) => content.native!.blockType === "content")
        .map((content) => content.native!),
    ),
    structural: Object.freeze(
      nativeContents.flatMap((content) =>
        content.native!.blockType === "content" ? [] : [content.native!.blockType],
      ),
    ),
  });

  const nativeIssues = validateNativeCapabilities(nativeCapabilities);

  if (nativeIssues.length) throw new Error(nativeIssues.map((issue) => issue.message).join("; "));

  for (const blockType of ["logic", "calculated"] as const) {
    if (nativeContents.filter((content) => content.native!.blockType === blockType).length > 1)
      throw new Error(`Duplicate native ${blockType} mapping`);
  }

  validateContentSyntax(
    contents.map((content) => content.source),
    fields.map((field) => field.kind),
  );

  if (new Set(contents.map((content) => content.kind)).size !== contents.length)
    throw new Error("Duplicate content definition");

  const kinds = new Set<string>(),
    storage = new Set<string>();

  for (const field of fields) {
    const { type, property, value } = field.source.storage;
    const key = JSON.stringify([type, property, value]);

    if (kinds.has(field.kind) || storage.has(key))
      throw new Error(`Duplicate field definition: ${field.kind}`);
    kinds.add(field.kind);
    storage.add(key);
  }

  for (let i = 0; i < fields.length; i++)
    for (const second of fields.slice(i + 1)) {
      const first = fields[i]!.source.storage,
        next = second.source.storage;

      if (
        first.type === next.type &&
        (!first.property || first.property !== next.property || first.value === next.value)
      )
        throw new Error(`Overlapping field storage: ${fields[i]!.kind} and ${second.kind}`);
    }

  const claimed = [
    ...fields,
    ...contents,
    ...structural.map((claim) => ({
      kind: `structural:${claim.storage.type}:${claim.storage.value ?? ""}`,
      source: { storage: claim.storage },
    })),
  ];

  for (let i = 0; i < claimed.length; i++)
    for (const next of claimed.slice(i + 1)) {
      const a = claimed[i]!.source.storage,
        b = next.source.storage;

      if (a.type === b.type && (!a.property || a.property !== b.property || a.value === b.value))
        throw new Error(`Overlapping document storage: ${claimed[i]!.kind} and ${next.kind}`);
    }

  const families = modules
    .flatMap((module) => module.storageFamilies ?? [])
    .map((family) => Object.freeze({ ...family }));

  if (new Set(families.map((family) => family.type)).size !== families.length)
    throw new Error("Duplicate field storage family");

  const nodeTypes = new Set(
    modules.flatMap((module) => module.nodes?.map((node) => node.type) ?? []),
  );

  for (const field of claimed) {
    const stored = field.source.storage;

    if (!nodeTypes.has(stored.type))
      throw new Error(`Field ${field.kind} requires node ${stored.type}`);

    if (!!stored.property !== (stored.value !== undefined))
      throw new Error(`Field ${field.kind} must declare both storage property and value`);
    const family = families.find((family) => family.type === stored.type);

    if (
      family &&
      (stored.property !== family.property ||
        (stored.defaultValue !== undefined && stored.defaultValue !== family.defaultValue))
    )
      throw new Error(`Field ${field.kind} conflicts with storage family ${stored.type}`);

    const defaults = claimed
      .filter((other) => other.source.storage.type === stored.type)
      .flatMap((other) =>
        other.source.storage.defaultValue === undefined ? [] : [other.source.storage.defaultValue],
      );

    if (new Set(defaults).size > 1)
      throw new Error(`Conflicting defaults for storage family ${stored.type}`);
  }

  const wrappedNodes = new Map<DocumentNodeDefinition, DocumentNodeDefinition>();

  const wrapped = modules.map((module) => ({
    ...module,
    nodes: module.nodes?.map((node) => {
      const existing = wrappedNodes.get(node);

      if (existing) return existing;

      const storage = claimed.find((field) => field.source.storage.type === node.type)?.source
        .storage;

      const family =
        families.find((family) => family.type === node.type) ??
        (storage?.property
          ? {
              property: storage.property,
              defaultValue: claimed.find(
                (field) =>
                  field.source.storage.type === node.type &&
                  field.source.storage.defaultValue !== undefined,
              )?.source.storage.defaultValue,
            }
          : undefined);

      if (!family) return node;
      const { property, defaultValue } = family;

      const allowed = claimed.flatMap((field) =>
        field.source.storage.type === node.type ? [field.source.storage.value!] : [],
      );

      const validate = node.validate;

      const declaration = {
        ...node,
        validate: (raw: Parameters<NonNullable<typeof node.validate>>[0]) => {
          const value = raw[property] === undefined ? defaultValue : raw[property];

          const stateEntry =
            raw.$ && typeof raw.$ === "object"
              ? Object.entries(raw.$).find(([key]) => key === property)
              : undefined;

          const values = stateEntry ? [value, stateEntry[1]] : [value];

          for (const kind of values)
            if (typeof kind !== "string" || !allowed.includes(kind))
              return `Unavailable ${node.type} field or block: ${String(kind)}`;

          return validate?.(raw);
        },
      };

      wrappedNodes.set(node, declaration);

      return declaration;
    }),
  }));

  const definition = Object.freeze({
    ...defineEditor(wrapped, namespace),
    kind: "form" as const,
    fields,
    contents,
    structural,
    logicActions,
    registry,
    nativeFields,
    nativeContents,
    nativeCapabilities,
    nativeFeatures,
  });

  for (const module of modules) module.validateDefinition?.(definition);

  return definition;
}

export type FormEditorDefinition = ReturnType<typeof defineFormEditor>;

export function formDefinition(definition: EditorDefinition): FormEditorDefinition {
  if (!("kind" in definition) || definition.kind !== "form" || !("fields" in definition))
    throw new Error("A form editor definition is required");

  // SAFETY: defineFormEditor owns the reserved form discriminator and adds its field/content registries together.
  return definition as FormEditorDefinition;
}
