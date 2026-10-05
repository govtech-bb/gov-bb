import {
  $getEditor,
  $getRoot,
  $isElementNode,
  $parseSerializedNode,
  type LexicalNode,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";
import { createHeadlessEditor } from "../../editor/core/create-editor";
import { editorDefinition } from "../../editor/core/context";
import { immutableData } from "../../editor/core/immutable";
import type { FormEditorDefinition } from "../definition";
import { resolveNativeContent, resolveNativeField } from "../native";
import type {
  FormRegistryEntry,
  FormRegistryForm,
  FormRegistryFragment,
} from "../registry/definition";
import { registryDocument, validateRegistryEntry } from "../registry/validation";
import {
  nativeSemanticEqual,
  remapNativeForm,
  validateFormDefinition,
  visitNativeReferences,
  type AnyFormBlock,
  type AnyFormDefinition,
  type ContentBlock,
  type NativeReference,
  type NativeDiagnostic,
} from "../schema";
import {
  nativeBlocksToSerialized,
  nativeFormToSerialized,
  serializedToNativeForm,
} from "./native-bindings";
import { $native, nativeBlockId } from "./native-state";
import { $blockId } from "../../editor/core/document-state";

export type PreparedRegistryFragment = {
  readonly entryKey: string;
  readonly scope: "fragment" | "page";
  readonly definition: FormEditorDefinition;
  readonly nodes: readonly SerializedLexicalNode[];
  readonly blocks: readonly AnyFormBlock[];
  readonly identities: readonly string[];
  readonly externalReferences: readonly string[];
  readonly foldedQuestions: readonly string[];
};

const issued = new WeakSet<PreparedRegistryFragment>(),
  consumed = new WeakSet<PreparedRegistryFragment>();

const walk = (blocks: readonly AnyFormBlock[], callback: (block: AnyFormBlock) => void) => {
  for (const block of blocks) {
    callback(block);

    if (block.type === "question" && Array.isArray(block.hint))
      walk(
        block.hint.filter(
          (item): item is ContentBlock =>
            typeof item === "object" && "type" in item && item.type === "content",
        ),
        callback,
      );

    if (block.type === "content" && block.kind === "expandable")
      // SAFETY: Registry content is validated before traversal; live key-owner snapshots never contain expandable content.
      walk((block.config as { blocks: ContentBlock[] }).blocks, callback);
  }
};

const fail = (key: string, message: string): never => {
  throw new Error(`Registry ${key}: ${message}`);
};

function currentJSON(node: LexicalNode): SerializedLexicalNode {
  const raw = node.exportJSON();

  if ($isElementNode(node)) Object.assign(raw, { children: node.getChildren().map(currentJSON) });

  return raw;
}

function lower(
  blocks: readonly AnyFormBlock[],
  definition: FormEditorDefinition,
  folded: readonly string[],
) {
  return nativeBlocksToSerialized(blocks, definition).map((node) =>
    node.type === "question" && folded.includes(node.$?.native?.owner ?? "")
      ? {
          ...node,
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Registry lowering retains module-authored settings; the headless import and native export proof below validates the complete result.
          $: { ...node.$, settings: { ...(node.$?.settings as object), folded: true } },
        }
      : node,
  );
}

/** Submitted keys belong to a repeat scope; they are not reference identities. */
function uniqueKeys(
  blocks: readonly AnyFormBlock[],
  occupied: Map<string, Set<string>>,
  initialScope = "form",
): Map<string, string> {
  const keys = new Map<string, string>();

  const claim = (scope: string, blockId: string, preferred: string) => {
    const used = occupied.get(scope) ?? new Set<string>();
    occupied.set(scope, used);

    let key = preferred,
      suffix = 2;

    while (used.has(key)) key = `${preferred}_${suffix++}`;
    used.add(key);
    keys.set(blockId, key);
  };

  let scope = initialScope;

  for (const block of blocks) {
    if (block.type === "page") {
      scope = block.repeat ? block.id : "form";

      if (block.repeat) claim("form", block.id, block.repeat.key);
    } else if (
      block.type === "question" ||
      (block.type === "calculated" && block.key !== undefined)
    )
      claim(scope, block.id, block.key!);
  }

  return keys;
}

function ownedKeys(form: AnyFormDefinition): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  uniqueKeys(form.blocks, result);

  return result;
}

function copyDocument(
  entry: FormRegistryEntry,
  definition: FormEditorDefinition,
): AnyFormDefinition {
  validateRegistryEntry(entry, definition);

  const source = registryDocument(entry),
    blocks = new Map<string, string>(),
    options = new Map<string, Map<string, string>>(),
    listItems = new Map<string, Map<string, string>>();

  walk(source.blocks, (block) => {
    blocks.set(block.id, crypto.randomUUID());

    if (block.type === "question" && block.options)
      options.set(
        block.id,
        new Map(block.options.map((option) => [option.id, crypto.randomUUID()])),
      );

    if (block.type === "content" && block.kind === "list")
      listItems.set(
        block.id,
        new Map(
          // SAFETY: Registry validation established list.config.items before identity allocation reads item IDs.
          (block.config as { items: { id: string }[] }).items.map((item) => [
            item.id,
            crypto.randomUUID(),
          ]),
        ),
      );
  });

  const owned = new Set(blocks.keys()),
    external = new Set(entry.externalReferences ?? []);

  const map = (reference: NativeReference): string => {
    if (reference.kind === "context") return reference.id;

    if (
      !owned.has(reference.ownerId ?? reference.id) &&
      !external.has(reference.ownerId ?? reference.id)
    )
      fail(entry.key, `external reference ${reference.id} requires an explicit factory binding`);

    return reference.kind === "option"
      ? (options.get(reference.ownerId!)?.get(reference.id) ?? reference.id)
      : reference.kind === "list-item"
        ? (listItems.get(reference.ownerId!)?.get(reference.id) ?? reference.id)
        : (blocks.get(reference.id) ?? reference.id);
  };

  visitNativeReferences(source, map);
  // Module hooks own references inside extension configuration. Opaque strings remain untouched.
  walk(source.blocks, (block) => {
    if (block.type === "question") {
      const references = resolveNativeField(block, definition)?.native?.references;

      if (references) Object.assign(block, references(block, map));
    } else if (block.type === "content") {
      const references = resolveNativeContent(block, definition)?.native?.references;

      if (references) Object.assign(block, references(block, map));
    }
  });
  const result = remapNativeForm(source, { blocks, options, listItems });
  result.id = crypto.randomUUID();

  return result;
}

/** Complete-form creation is host-owned; importing user JSON uses the ID-preserving converter. */
export function createRegistryForm(
  entry: FormRegistryForm,
  definition: FormEditorDefinition,
): AnyFormDefinition {
  if (entry.scope !== "form") return fail(entry.key, "choose a complete form entry");

  if (entry.externalReferences?.length)
    return fail(entry.key, "a new form cannot bind to another draft");

  const form = copyDocument(entry, definition),
    result = validateFormDefinition(form, definition.nativeCapabilities);

  if (result.status !== "ready") return fail(entry.key, result.diagnostics[0]!.message);

  return form;
}

/** Validate and lower directly before any slash trigger or document mutation. */
export function prepareRegistryEntry(
  entry: FormRegistryFragment,
  definition: FormEditorDefinition,
): PreparedRegistryFragment {
  // SAFETY: this widening keeps the runtime guard for JavaScript callers even though the TypeScript contract accepts fragments only.
  if (entry.scope === ("form" as string))
    return fail(entry.key, "complete forms must be created by the host");
  const form = copyDocument(entry, definition);

  const proof = createHeadlessEditor(definition, nativeFormToSerialized(form, definition), {
    prepare: false,
  });

  try {
    const diagnostics: NativeDiagnostic[] = [];

    const restored = serializedToNativeForm(
      proof.getEditorState().toJSON(),
      definition,
      diagnostics,
    );

    if (diagnostics.length || !nativeSemanticEqual(form, restored))
      return fail(entry.key, "the installed modules cannot preserve this native definition");
  } finally {
    proof.dispose();
  }

  const blocks =
    entry.scope === "fragment" ? form.blocks.filter((block) => block.type !== "page") : form.blocks;

  const foldedQuestions = entry.blocks.flatMap((block, index) =>
    entry.foldedQuestions?.includes(block.id) ? [blocks[index]!.id] : [],
  );

  const nodes = lower(blocks, definition, foldedQuestions);

  const state: SerializedEditorState = {
    root: {
      type: "root",
      version: 1,
      children: nodes,
      direction: null,
      format: "",
      indent: 0,
    },
  };

  definition.validateDocument(state);
  const hydrated = createHeadlessEditor(definition, state, { prepare: false });
  let snapshot: SerializedEditorState;

  try {
    snapshot = hydrated.getEditorState().toJSON();
  } finally {
    hydrated.dispose();
  }

  const identities: string[] = [];
  walk(blocks, (block) => {
    identities.push(block.id);
  });

  const prepared: PreparedRegistryFragment = Object.freeze({
    entryKey: entry.key,
    scope: entry.scope,
    definition,
    blocks: immutableData(blocks),
    nodes: immutableData(snapshot.root.children),
    identities: Object.freeze(identities),
    externalReferences: Object.freeze([...(entry.externalReferences ?? [])]),
    foldedQuestions: Object.freeze(foldedQuestions),
  });

  issued.add(prepared);

  return prepared;
}

/** One prepared copy belongs to one configured editor and can be consumed only once. */
export function $instantiateRegistryEntry(
  prepared: PreparedRegistryFragment,
  target?: LexicalNode | null,
): LexicalNode[] {
  if (!issued.has(prepared)) return fail(prepared.entryKey, "use a prepared registry copy");

  if (editorDefinition($getEditor()) !== prepared.definition)
    return fail(prepared.entryKey, "insertion must use its prepared editor definition");

  if (consumed.has(prepared))
    return fail(prepared.entryKey, "prepare a new fragment for each insertion");
  const occupied = new Set<string>();

  for (const node of $getRoot().getChildren()) {
    const native = $native(node),
      id = nativeBlockId(native);

    if (id) occupied.add(id);
    const blockId = $blockId(node);

    if (blockId) occupied.add(blockId);
  }

  if (prepared.identities.some((id) => occupied.has(id)))
    return fail(prepared.entryKey, "a copied identity already exists in this form");
  let destination: AnyFormDefinition | undefined;

  try {
    destination = serializedToNativeForm(
      // SAFETY: currentJSON receives the Lexical RootNode here and only replaces its children with recursively serialized children.
      { root: currentJSON($getRoot()) as SerializedEditorState["root"] },
      prepared.definition,
    );
  } catch {
    /* Legacy drafts gain native bindings through the host preparation path. */
  }

  if (prepared.externalReferences.length && !destination)
    return fail(prepared.entryKey, "external bindings require a native destination form");

  let page = target ?? $getRoot().getLastChild(),
    pageId: string | undefined;

  while (page) {
    if ($native(page).page) {
      pageId = $native(page).page!.id;
      break;
    }

    page = page.getPreviousSibling();
  }

  const destinationPage = destination?.blocks.find(
    (block) => block.id === pageId && block.type === "page",
  );

  const initialScope =
    destinationPage?.type === "page" && destinationPage.repeat ? destinationPage.id : "form";

  const template: AnyFormDefinition = {
    schemaVersion: 2,
    id: "copy",
    title: "Copy",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: structuredClone([...prepared.blocks]),
  };

  const liveBlocks = [
    ...new Map(
      $getRoot()
        .getChildren()
        .flatMap((node) => {
          const native = $native(node),
            block = native.page ?? native.question ?? native.calculated;

          // SAFETY: These live page/question/calculated snapshots are used only by uniqueKeys, which reads identities and repeat keys, never editable labels or titles.
          return block ? [[block.id, block as AnyFormBlock] as const] : [];
        }),
    ).values(),
  ];

  const liveKeys = new Map<string, Set<string>>();
  uniqueKeys(liveBlocks, liveKeys);

  const blocks = remapNativeForm(template, {
    blocks: new Map(),
    keys: uniqueKeys(
      template.blocks,
      destination ? ownedKeys(destination) : liveKeys,
      initialScope,
    ),
  }).blocks;

  if (destination) {
    for (const id of prepared.externalReferences)
      if (!destination.blocks.some((block) => block.id === id))
        return fail(prepared.entryKey, `external binding ${id} no longer exists`);

    const combined = structuredClone(destination),
      start = Math.max(
        0,
        combined.blocks.findIndex((block) => block.id === pageId),
      );

    const nextPage = combined.blocks.findIndex(
      (block, index) => index > start && block.type === "page",
    );

    combined.blocks.splice(nextPage < 0 ? combined.blocks.length : nextPage, 0, ...blocks);
    const checked = validateFormDefinition(combined, prepared.definition.nativeCapabilities);

    if (checked.status !== "ready") return fail(prepared.entryKey, checked.diagnostics[0]!.message);
  }

  const nodes = lower(blocks, prepared.definition, prepared.foldedQuestions).map((node) =>
    $parseSerializedNode(node),
  );

  consumed.add(prepared);

  return nodes;
}
