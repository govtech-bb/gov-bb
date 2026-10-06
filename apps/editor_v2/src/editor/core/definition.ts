import type { EditorThemeClasses, SerializedEditorState } from "lexical";
import type { DocumentNode, DocumentNodeDefinition, EditorModule } from "./module";
import { immutableData } from "./immutable";

function unique(values: readonly string[], label: string) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function defineEditor(modules: readonly EditorModule[], namespace = "modular-editor") {
  unique(
    modules.map((module) => module.key),
    "module key",
  );
  const capabilities = new Set(modules.flatMap((module) => module.provides ?? []));

  for (const module of modules)
    for (const required of module.requires ?? [])
      if (!capabilities.has(required)) throw new Error(`Module ${module.key} requires ${required}`);
  const owners = modules.flatMap((module) => (module.historyOwner ? [module.historyOwner] : []));

  if (owners.length > 1) throw new Error(`Multiple history owners: ${owners.join(", ")}`);
  const nodes = new Map<string, DocumentNodeDefinition>();

  for (const module of modules)
    for (const definition of module.nodes ?? []) {
      if (definition.node.getType() !== definition.type)
        throw new Error(
          `Node declaration ${definition.type} does not match ${definition.node.getType()}`,
        );
      const previous = nodes.get(definition.type);

      if (previous && previous !== definition)
        throw new Error(`Conflicting node owner: ${definition.type}`);
      nodes.set(definition.type, definition);
    }

  const definitions = Object.freeze([...nodes.values()].map((node) => Object.freeze({ ...node })));
  const resolvedNodes = new Map(definitions.map((node) => [node.type, node]));

  const registrations = Object.freeze(
    modules
      .flatMap((module) => module.registrations ?? [])
      .map((item) => Object.freeze({ ...item })),
  );

  unique(
    registrations.map((item) => item.key),
    "registration key",
  );

  const actions = Object.freeze(
    modules
      .flatMap((module) => module.actions ?? [])
      .map((item) => Object.freeze({ ...item }))
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)),
  );

  const renderers = Object.freeze(
    modules.flatMap((module) => module.renderers ?? []).map((item) => Object.freeze({ ...item })),
  );

  const slots = Object.freeze(
    modules.flatMap((module) => module.slots ?? []).map((item) => Object.freeze({ ...item })),
  );

  unique(
    actions.map((item) => item.id),
    "action ID",
  );
  unique(
    renderers.map((item) => item.key),
    "renderer key",
  );
  unique(
    slots.map((item) => item.key),
    "slot contribution key",
  );
  const theme: EditorThemeClasses = {};

  for (const module of modules) Object.assign(theme, module.theme ?? {});
  const resolvedTheme = immutableData(theme);

  const initializers = modules.flatMap((module) =>
    module.$initialize ? [module.$initialize] : [],
  );

  if (initializers.length > 1)
    throw new Error("An editor has multiple default document initializers");

  const normalizers = Object.freeze(
    modules.flatMap((module) => (module.$normalizeInitial ? [module.$normalizeInitial] : [])),
  );

  function validateDocument(value: unknown): SerializedEditorState {
    const visit = (raw: unknown, path: string, root = false): void => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(`Invalid document node at ${path}`);
      // SAFETY: This raw saved-node projection is only read by the ownership/child checks
      // below and the owning module validator. Node-specific attributes are parsed by Lexical.
      const node = raw as DocumentNode;

      if (root ? node.type !== "root" : !resolvedNodes.has(node.type))
        throw new Error(`Unsupported node ${String(node.type)} at ${path}`);
      const message = root ? undefined : resolvedNodes.get(node.type)!.validate?.(node);

      if (message) throw new Error(`${message} at ${path}`);

      if (root && !Array.isArray(node.children)) throw new Error("Document root needs children");

      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) throw new Error(`Invalid children at ${path}`);
        node.children.forEach((child, index) => visit(child, `${path}/${index}`));
      }
    };

    if (!value || typeof value !== "object" || !("root" in value))
      throw new Error("Invalid editor document");
    visit(value.root, "root", true);

    // SAFETY: Ownership and children have been checked recursively. Preserve the remaining
    // serialized fields for each registered Lexical node importer; do not strip saved data.
    return structuredClone(value) as SerializedEditorState;
  }

  return Object.freeze({
    namespace,
    capabilities: Object.freeze([...capabilities]),
    moduleKeys: Object.freeze(modules.map((module) => module.key)),
    nodes: definitions,
    registrations,
    actions,
    renderers,
    slots,
    browserExtensions: Object.freeze(modules.flatMap((module) => module.browserExtensions ?? [])),
    theme: resolvedTheme,
    $initialize: initializers[0],
    $normalizeInitial: () => {
      for (const normalize of normalizers) normalize();
    },
    validateDocument,
  });
}

export type EditorDefinition = ReturnType<typeof defineEditor>;
