import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { validatePageSettings } from "../core/pages";
import type { FormEditorDefinition } from "../definition";
import { resolveNativeContent, resolveNativeField, type NativeContentBlock } from "../native";
import type {
  AnyFormDefinition,
  AnyFormBlock,
  ContentBase,
  QuestionBase,
  RichText,
  PageBlock,
} from "../schema/types";
import { nativeSemanticEqual } from "../schema/semantics";
import type { NativeDiagnostic } from "../schema/diagnostics";
import {
  nativeMetadata,
  rawNative,
  withNative,
  type NativeRawNode,
  type NativeNodeData,
} from "./native-state";
import {
  nativeElement,
  nativeTextToNodes,
  nodesToNativeText,
  NativeTextError,
} from "./native-text";
import { nativeQuestionSettings } from "./native-settings";
import { nativeFormSettings } from "./native-form-settings";

export class NativeBindingError extends Error {
  constructor(readonly diagnostic: NativeDiagnostic) {
    super(diagnostic.message);
  }
}

function fail(message: string, blockId?: string, path: (string | number)[] = []): never {
  throw new NativeBindingError({
    code: "native-binding",
    severity: "error",
    message,
    path,
    ...(blockId && { blockId }),
  });
}

const properties = (type: string, property?: string, value?: string) => ({
  type,
  ...(property && { [property]: value }),
});

const data = (
  node: NativeRawNode,
  native: NativeNodeData,
  id: string,
  depth = 0,
): NativeRawNode & { $: NonNullable<NativeRawNode["$"]> } => ({
  ...withNative(node, native),
  $: { ...node.$, native: structuredClone(native), id, depth },
});

const rawSettings = (node: NativeRawNode): Record<string, unknown> =>
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Lexical NodeState retains raw authored settings; assertOwnedRaw and validateFormDefinition reject unsupported data at export.
  (node.$?.settings ?? {}) as Record<string, unknown>;

const plain = (node: NativeRawNode): string =>
  node.type === "linebreak"
    ? "\n"
    : typeof node.text === "string"
      ? node.text
      : (node.children ?? []).map(plain).join("");

const editorSettings = [
  "field",
  "sourceKey",
  "sourceExplicit",
  "sourceFieldId",
  "sourceLabel",
  "sourcePreset",
  "ref",
  "folded",
  "logicVersion",
];

const questionSettings = new Set([
  ...editorSettings,
  "fieldId",
  "required",
  "hidden",
  "hideLabel",
  "isDisabled",
  "hasDefaultAnswer",
  "defaultAnswer",
  "width",
  "placeholder",
  "mask",
  "step",
  "fieldArray",
  "errors",
  "pattern",
  "relativeDate",
  "beforeDate",
  "afterDate",
  "dateRange",
  "specificDates",
  "hasMultipleFiles",
  "allowedFiles",
  "hasMinCharacters",
  "minCharacters",
  "hasMaxCharacters",
  "maxCharacters",
  "hasMinNumber",
  "minNumber",
  "hasMaxNumber",
  "maxNumber",
  "hasMinChoices",
  "minChoices",
  "hasMaxChoices",
  "maxChoices",
  "hasMinAge",
  "minAge",
  "hasMaxAge",
  "maxAge",
  "hasMinFiles",
  "minFiles",
  "hasMaxFiles",
  "maxFiles",
  "hasMaxFileSize",
  "maxFileSize",
  "optionValue",
  "sourceOptionValue",
  "nativeOptions",
  "nativeGroups",
  "groups",
]);

const builtInQuestions = new Set([
  "text",
  "long-text",
  "email",
  "phone",
  "number",
  "time",
  "date",
  "choice",
  "boolean",
  "file",
  "address-lookup",
  "opening-hours",
]);

const builtInContents = new Set([
  "paragraph",
  "question-label",
  "heading",
  "callout",
  "list",
  "expandable",
]);

function assertOwnedRaw(node: NativeRawNode, settings: ReadonlySet<string>, blockId: string) {
  for (const key of Object.keys(rawNative(node)))
    if (
      ![
        "version",
        "form",
        "page",
        "question",
        "option",
        "options",
        "content",
        "logic",
        "calculated",
        "owner",
        "part",
        "hintShape",
        "hintOwner",
        "listItem",
        "container",
      ].includes(key)
    )
      fail(`This block's native ${key} state has no form representation`, blockId, ["native", key]);

  for (const key of Object.keys(node.$ ?? {}))
    if (
      ![
        "native",
        "id",
        "depth",
        "settings",
        "index",
        "listIndex",
        "sourceAnchor",
        "nativeSourceDepth",
      ].includes(key)
    )
      fail(`This block's ${key} state has no native form representation`, blockId, ["state", key]);

  for (const key of Object.keys(rawSettings(node)))
    if (!settings.has(key))
      fail(`This block's ${key} setting has no native form representation`, blockId, [
        "settings",
        key,
      ]);

  const properties = new Set([
    "type",
    "version",
    "children",
    "$",
    "direction",
    "format",
    "indent",
    "tag",
    "kind",
    "widget",
    "index",
    "textFormat",
    "textStyle",
  ]);

  for (const key of Object.keys(node))
    if (!properties.has(key))
      fail(`This block's ${key} property has no native form representation`, blockId, [key]);

  if (node.direction || (node.format && node.format !== 0) || node.indent)
    fail("This block's text alignment or direction has no native form representation", blockId);
}

/** Lower blocks directly for registry fragments and page insertion through installed module handlers. */
export function nativeBlocksToSerialized(
  blocks: readonly AnyFormBlock[],
  definition: FormEditorDefinition,
): NativeRawNode[] {
  function importQuestion(question: QuestionBase, fieldKind: string): SerializedLexicalNode[] {
    const field = definition.fields.find((field) => field.kind === fieldKind);

    if (!field?.native)
      return fail(`Install the ${fieldKind} field to import this question`, question.id);
    const metadata = nativeMetadata(question, "label", "hint", "options");

    const labelNode = data(
      nativeElement("question", nativeTextToNodes(question.label)),
      { owner: question.id, part: "label" },
      `label:${question.id}`,
    );

    if (question.parts?.label?.visible !== undefined)
      labelNode.$.settings = { hidden: !question.parts.label.visible };
    const nodes: NativeRawNode[] = [labelNode];

    if (question.hint !== undefined) {
      const structured =
        Array.isArray(question.hint) &&
        question.hint.length > 0 &&
        typeof question.hint[0] === "object" &&
        "type" in question.hint[0] &&
        question.hint[0].type === "content";

      if (structured)
        // SAFETY: hint is rich text or a uniform content-block array; the first item's content discriminator selects the latter.
        for (const hint of question.hint as ContentBase[]) {
          for (const node of lower(hint))
            nodes.push(
              // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- hintShape is a persisted Markdown metadata key; renaming would discard saved hint representation.
              withNative(node, { ...rawNative(node), hintOwner: question.id, hintShape: "blocks" }),
            );
        }
      else
        nodes.push(
          data(
            // SAFETY: the content-block variant was handled above; an empty array is also valid rich text.
            nativeElement("paragraph", nativeTextToNodes(question.hint as RichText)),
            // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- hintShape is a persisted Markdown metadata key; renaming would discard saved hint representation.
            { owner: question.id, part: "hint", hintShape: "rich" },
            `hint:${question.id}`,
          ),
        );
    }

    if (question.parts?.hint?.visible !== undefined)
      for (const node of nodes)
        if (rawNative(node).part === "hint" || rawNative(node).hintOwner === question.id)
          node.$ = {
            ...node.$,
            settings: { ...rawSettings(node), hidden: !question.parts.hint.visible },
          };
    const storage = field.source.storage;
    const settings = nativeQuestionSettings(metadata);

    const input = () =>
      storage.type === "widget"
        ? {
            ...properties(storage.type, storage.property, storage.value),
            version: 1,
          }
        : nativeElement(
            storage.type,
            [],
            properties(storage.type, storage.property, storage.value),
          );

    if (field.source.choice) {
      for (const option of question.options ?? []) {
        const { label, ...optionMetadata } = option;

        const node = data(
          { ...input(), children: nativeTextToNodes(label) },
          { question: metadata, option: optionMetadata, owner: question.id, part: "option" },
          `option:${question.id}:${option.id}`,
        );

        node.$.settings = {
          ...settings,
          optionValue: option.value,
          ...(option.visible !== undefined && { hidden: !option.visible }),
        };
        nodes.push(node);
      }

      if (!question.options?.length) fail("A choice question needs options", question.id);
    } else {
      const node = data(
        input(),
        {
          question: metadata,
          owner: question.id,
          part: "input",
          ...(question.options && { options: question.options }),
        },
        `input:${question.id}`,
      );

      node.$.settings = settings;
      nodes.push(node);
    }

    return nodes;
  }

  function importContent(block: NativeContentBlock, contentKind: string): SerializedLexicalNode[] {
    const content = definition.contents.find((content) => content.kind === contentKind);

    if (!content?.native)
      return fail(`Install the ${contentKind} block to import this content`, block.id);
    const storage = content.source.storage;

    if (block.type === "logic" || block.type === "calculated") {
      const node = data(
        { ...properties(storage.type, storage.property, storage.value), version: 1 },
        { [block.type]: block },
        block.id,
      );

      node.$.settings = { native: block };

      return [node];
    }

    const metadata = nativeMetadata(block, "content");
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Module configuration is opaque at this adapter boundary; built-in import validation or the installed module owns its schema.
    const config = (block.config ?? {}) as Record<string, unknown>;

    if (block.kind === "list") {
      // SAFETY: Native import validation checked the list item records before the built-in list renderer lowers them.
      const items = config.items as { id: string; content: RichText; visible?: boolean }[];

      if (!items?.length) fail("A list needs at least one item", block.id);
      const { items: _items, ...configuration } = config;
      const listMetadata = { ...metadata, config: configuration };

      const introduction = data(
        nativeElement("paragraph", nativeTextToNodes(block.content)),
        { content: listMetadata, owner: block.id, part: "list-content" },
        block.id,
      );

      if (block.visible !== undefined) introduction.$.settings = { hidden: !block.visible };

      return [
        introduction,
        ...items.map((item) => {
          const { content: text, ...listItem } = item;

          const node = data(
            nativeElement(
              storage.type,
              nativeTextToNodes(text),
              properties(storage.type, storage.property, storage.value),
            ),
            { content: listMetadata, listItem, owner: block.id, part: "list-item" },
            `item:${block.id}:${item.id}`,
          );

          if (item.visible !== undefined || block.visible !== undefined)
            node.$.settings = { hidden: item.visible === false || block.visible === false };

          return node;
        }),
      ];
    }

    const node = data(
      nativeElement(
        storage.type,
        nativeTextToNodes(block.content),
        properties(storage.type, storage.property, storage.value),
      ),
      { content: metadata },
      block.id,
    );

    if (block.visible !== undefined) node.$.settings = { hidden: !block.visible };

    if (block.kind !== "expandable") return [node];
    const { blocks: nested, ...configuration } = config;
    node.$.native = { content: { ...metadata, config: configuration } };

    return [
      node,
      // SAFETY: Native import validation checked expandable.config.blocks before recursively lowering this built-in container.
      ...((nested as ContentBase[]) ?? []).flatMap((child) =>
        lower(child).map((n) => ({
          ...withNative(n, { ...rawNative(n), container: rawNative(n).container ?? block.id }),
          $: {
            ...n.$,
            native: { ...rawNative(n), container: rawNative(n).container ?? block.id },
            depth: Number(n.$?.depth ?? 0) + 1,
          },
        })),
      ),
    ];
  }

  function lower(block: Exclude<AnyFormBlock, PageBlock>): NativeRawNode[] {
    if (block.type === "question") {
      const field = resolveNativeField(block, definition);

      if (!field?.native) return fail(`No installed field handles ${block.kind}`, block.id);

      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Extension imports expose serialized Lexical nodes; the headless hydration and native export proof validate their full node payloads.
      return field.native.import(block, { importQuestion }) as NativeRawNode[];
    }

    const content = resolveNativeContent(block, definition);

    if (!content?.native)
      return fail(
        `No installed content handles ${block.type === "content" ? block.kind : block.type}`,
        block.id,
      );

    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Extension imports expose serialized Lexical nodes; the headless hydration and native export proof validate their full node payloads.
    return content.native.import(block, { importContent }) as NativeRawNode[];
  }

  const nodes = blocks.flatMap((block) =>
    block.type === "page" ? nativePageToSerialized(block) : lower(block),
  );

  for (const block of blocks) {
    if (!("layout" in block) || !block.layout) continue;
    const under = block.layout.under;

    const own = nodes.filter((node) => {
      const native = rawNative(node);

      return (
        native.question?.id === block.id ||
        native.content?.id === block.id ||
        native.owner === block.id ||
        native.hintOwner === block.id
      );
    });

    const containers = new Set([block.id]);

    for (const node of nodes)
      if (rawNative(node).container && containers.has(rawNative(node).container!)) {
        if (!own.includes(node)) own.push(node);

        if (rawNative(node).content) containers.add(rawNative(node).content!.id);
      }

    const host =
      "question" in under
        ? nodes.find(
            (node) =>
              rawNative(node).question?.id === under.question &&
              rawNative(node).option?.id === under.option,
          )
        : nodes.findLast((node) => {
            const native = rawNative(node);

            return native.question?.id === under.block || native.content?.id === under.block;
          });

    if (!host || !own.length) continue;
    const shift = Number(host.$?.depth ?? 0) + 1 - Number(own[0]?.$?.depth ?? 0);

    for (const node of own) {
      nodes.splice(nodes.indexOf(node), 1);
      node.$ = { ...node.$, depth: Number(node.$?.depth ?? 0) + shift };
    }

    let at = nodes.indexOf(host) + 1;

    while (nodes[at] && Number(nodes[at]?.$?.depth ?? 0) > Number(host.$?.depth ?? 0)) at++;
    nodes.splice(at, 0, ...own);
  }

  return nodes;
}

function nativePageToSerialized(block: PageBlock): NativeRawNode[] {
  const page = nativeMetadata(block, "title", "description");
  const start = data({ type: "widget", widget: "page-break", version: 1 }, { page }, block.id);

  const settings: import("../core/settings").Settings = {
    pageId: block.id,
    ...(block.role === "confirmation"
      ? { confirmation: true }
      : block.role === "review"
        ? { pageType: "check-answers" }
        : block.role !== "questions"
          ? { pageType: block.role }
          : {}),
  };

  if (block.visible !== undefined) settings.hidden = !block.visible;

  if (block.navigation?.nextLabel !== undefined) settings.button = block.navigation.nextLabel;

  if (block.navigation?.backLabel !== undefined) settings.backButton = block.navigation.backLabel;

  if (block.repeat)
    settings.repeatable = {
      min: block.repeat.min,
      ...(block.repeat.max !== undefined && { max: block.repeat.max }),
      addAnotherLabel: block.repeat.addLabel,
      ...(block.repeat.itemLabel !== undefined && { instanceLabel: block.repeat.itemLabel }),
    };

  start.$.settings = settings;

  return [
    start,
    data(
      nativeElement("page-title", nativeTextToNodes(block.title)),
      { owner: block.id },
      `title:${block.id}`,
    ),
    ...(block.description !== undefined
      ? [
          data(
            nativeElement("page-description", nativeTextToNodes(block.description)),
            { owner: block.id },
            `description:${block.id}`,
          ),
        ]
      : []),
  ];
}

/** The service-name node owns the first page boundary in a complete editor document. */
export function nativeFormToSerialized(
  form: AnyFormDefinition,
  definition: FormEditorDefinition,
): SerializedEditorState {
  const { title: formTitle, blocks, ...formMetadata } = form;
  const [firstPage, ...body] = nativeBlocksToSerialized(blocks, definition);

  if (!firstPage || !rawNative(firstPage).page)
    return fail("The first native block must be a page");

  const title = data(
    nativeElement("form-title", nativeTextToNodes(formTitle)),
    { ...rawNative(firstPage), version: 1, form: formMetadata },
    `form:${form.id}`,
  );

  title.$.settings = {
    ...rawSettings(firstPage),
    logicVersion: 2,
    formSettings: nativeFormSettings(formMetadata),
  };

  // SAFETY: nativeElement constructs the root with type, version, children, format, indent and direction required by SerializedEditorState.
  return { root: nativeElement("root", [title, ...body]) } as SerializedEditorState;
}

/** Reads editable text and current native feature state; does not assign identities or normalize. */
export function serializedToNativeForm(
  state: SerializedEditorState,
  definition: FormEditorDefinition,
  diagnostics?: NativeDiagnostic[],
): AnyFormDefinition {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The editor export carries retained NodeState beyond Lexical base node types; native export checks the provisional metadata before publishing.
  const nodes = state.root.children as NativeRawNode[];
  const first = nodes[0];
  const form = first && rawNative(first).form;

  if (!first || first.type !== "form-title" || !form)
    return fail("This draft needs native form bindings before JSON export");
  const consumed = new Set<NativeRawNode>();
  const blocks: AnyFormBlock[] = [];
  const containers = new Map<NativeRawNode, string>();
  const ancestors: { id: string; depth: number }[] = [];

  for (const node of nodes) {
    const depth = Number(node.$?.depth ?? 0);

    while (ancestors.length && ancestors.at(-1)!.depth >= depth) ancestors.pop();

    if (ancestors.length && rawNative(node).container) containers.set(node, ancestors.at(-1)!.id);

    if (rawNative(node).content?.kind === "expandable")
      ancestors.push({ id: rawNative(node).content!.id, depth });
  }

  function readLayout(node: NativeRawNode, result: QuestionBase | ContentBase) {
    if (containers.has(node) || rawNative(node).hintOwner) return;
    const depth = Number(node.$?.depth ?? 0);
    delete result.layout;

    if (!depth) return;
    const at = nodes.indexOf(node);

    for (let index = at - 1; index >= 0; index--) {
      const previous = nodes[index]!;

      if (Number(previous.$?.depth ?? 0) >= depth) continue;
      const native = rawNative(previous);

      if (native.question && native.option)
        result.layout = { under: { question: native.question.id, option: native.option.id } };
      else if (native.question) result.layout = { under: { block: native.question.id } };
      else if (native.content) result.layout = { under: { block: native.content.id } };
      break;
    }
  }

  function exportQuestion(node: NativeRawNode, fieldKind: string): QuestionBase {
    const question = rawNative(node).question!;
    const members = nodes.filter((n) => rawNative(n).owner === question.id);
    const label = members.find((n) => rawNative(n).part === "label");

    const hints = nodes.filter(
      (n) =>
        rawNative(n).hintOwner === question.id ||
        (rawNative(n).owner === question.id && rawNative(n).part === "hint"),
    );

    const inputs = members.filter((n) => rawNative(n).question);

    if (builtInQuestions.has(question.kind))
      for (const member of members)
        assertOwnedRaw(
          member,
          rawNative(member).question ? questionSettings : new Set([...editorSettings, "hidden"]),
          question.id,
        );

    for (const input of inputs)
      if (!nativeSemanticEqual(rawNative(input).question, question))
        fail("Options disagree about their shared question settings", question.id);
    members.forEach((n) => consumed.add(n));

    const result: QuestionBase = {
      ...structuredClone(question),
      label: nodesToNativeText(label?.children ?? []),
    };

    readLayout(label ?? node, result);

    if (hints.length) {
      if (rawNative(hints[0]!).hintShape === "blocks")
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Draft hint blocks may still be incomplete; retain their metadata until validateFormDefinition checks the assembled exported question.
        result.hint = hints
          .filter((n) => rawNative(n).content && !containers.has(n) && !rawNative(n).listItem)
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Draft hint blocks may still be incomplete; retain their metadata until validateFormDefinition checks the assembled exported question.
          .map((n) => exportContent(n) as ContentBase) as QuestionBase["hint"];
      else
        result.hint = nodesToNativeText(
          hints.flatMap((n, index) => [
            ...(index ? [{ type: "linebreak", version: 1 }] : []),
            ...(n.children ?? []),
          ]),
        );
    }

    const field = definition.fields.find((field) => field.kind === fieldKind);

    if (field?.source.choice)
      result.options = inputs.map((input) => {
        const option = rawNative(input).option;

        if (!option) return fail("This option needs a stable ID and submitted value", question.id);

        return { ...structuredClone(option), label: nodesToNativeText(input.children ?? []) };
      });
    else if (rawNative(node).options) result.options = structuredClone(rawNative(node).options);

    return result;
  }

  function exportContent(node: NativeRawNode): NativeContentBlock {
    const native = rawNative(node);
    consumed.add(node);

    if (native.logic) {
      if (native.logic.type !== "logic")
        fail("This conditional logic block needs a valid logic payload", String(node.$?.id ?? ""));
      assertOwnedRaw(
        node,
        new Set([
          ...editorSettings,
          "native",
          "hidden",
          "logicalOperator",
          "conditionals",
          "actions",
        ]),
        native.logic.id,
      );

      return structuredClone(native.logic);
    }

    if (native.calculated) {
      if (native.calculated.type !== "calculated")
        fail("This calculated value needs a valid calculation payload", String(node.$?.id ?? ""));
      assertOwnedRaw(
        node,
        new Set([...editorSettings, "native", "hidden", "calculatedFields"]),
        native.calculated.id,
      );

      return structuredClone(native.calculated);
    }

    if (!native.content)
      return fail("This content needs a native binding", String(node.$?.id ?? ""));

    const result: ContentBase = {
      ...structuredClone(native.content),
      content: nodesToNativeText(node.children ?? []),
    };

    if (builtInContents.has(result.kind))
      assertOwnedRaw(node, new Set([...editorSettings, "hidden"]), result.id);
    readLayout(node, result);

    if (result.kind === "list") {
      const items = nodes.filter((n) => rawNative(n).owner === result.id && rawNative(n).listItem);

      const introduction = nodes.find(
        (n) => rawNative(n).owner === result.id && rawNative(n).part === "list-content",
      );

      result.content = nodesToNativeText(introduction?.children ?? []);

      if (introduction) consumed.add(introduction);
      result.config = {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- List export combines the retained draft config with live items; validateFormDefinition checks the assembled content block.
        ...(result.config as object),
        items: items.map((n) => {
          assertOwnedRaw(n, new Set([...editorSettings, "hidden"]), result.id);
          consumed.add(n);

          return { ...rawNative(n).listItem!, content: nodesToNativeText(n.children ?? []) };
        }),
      };
    }

    if (result.kind === "expandable")
      result.config = {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Expandable export combines retained draft config with live children; validateFormDefinition checks the assembled content block.
        ...(result.config as object),
        blocks: nodes.flatMap((n) =>
          rawNative(n).content && containers.get(n) === result.id && !consumed.has(n)
            ? [exportContent(n)]
            : [],
        ),
      };

    return result;
  }

  for (const [index, node] of nodes.entries()) {
    if (consumed.has(node)) continue;

    try {
      const native = rawNative(node);

      if (native.page) {
        const error = validatePageSettings(node.$?.settings);

        if (error) return fail(error, native.page.id);
        assertOwnedRaw(
          node,
          new Set([
            ...editorSettings,
            "pageId",
            "hidden",
            "confirmation",
            "pageType",
            "button",
            "backButton",
            "repeatable",
            "formSettings",
          ]),
          native.page.id,
        );
        const title = nodes[index + 1];
        const description = nodes[index + 2];

        if (title?.type !== "page-title")
          return fail("A page heading must follow its page boundary", native.page.id);
        assertOwnedRaw(title, new Set(editorSettings), native.page.id);
        consumed.add(title);

        const page: PageBlock = {
          ...structuredClone(native.page),
          title: nodesToNativeText(title.children ?? []),
        };

        if (description?.type === "page-description") {
          assertOwnedRaw(description, new Set(editorSettings), native.page.id);
          page.description = nodesToNativeText(description.children ?? []);
          consumed.add(description);
        }

        blocks.push(page);
      } else if (native.hintOwner) {
        continue;
      } else if (native.question) {
        const question: QuestionBase = { ...native.question, label: "" };
        const field = resolveNativeField(question, definition);

        if (!field?.native) return fail(`No installed field handles ${question.kind}`, question.id);
        blocks.push(
          field.native.export({
            nodes: nodes.filter(
              (member) =>
                rawNative(member).owner === question.id ||
                rawNative(member).hintOwner === question.id,
            ),
            exportQuestion: (kind) => exportQuestion(node, kind),
          }),
        );
      } else if (native.content || native.logic || native.calculated) {
        if (native.logic && native.logic.type !== "logic")
          fail(
            "This conditional logic block needs a valid logic payload",
            String(node.$?.id ?? ""),
          );

        if (native.calculated && native.calculated.type !== "calculated")
          fail("This calculated value needs a valid calculation payload", String(node.$?.id ?? ""));
        const block = native.logic ?? native.calculated ?? { ...native.content!, content: "" };
        const content = resolveNativeContent(block, definition);

        if (!content?.native) return fail(`No installed content handles ${block.type}`, block.id);
        blocks.push(
          content.native.export({
            nodes: nodes.filter(
              (member) =>
                member === node ||
                rawNative(member).owner === block.id ||
                rawNative(member).container === block.id,
            ),
            exportContent: () => exportContent(node),
          }),
        );
      } else if (!native.owner && !(node.type === "paragraph" && !plain(node))) {
        fail(`This ${node.type} block needs a native binding`, String(node.$?.id ?? ""), [
          "blocks",
          index,
        ]);
      }
    } catch (error) {
      const diagnostic =
        error instanceof NativeBindingError
          ? error.diagnostic
          : error instanceof NativeTextError
            ? {
                code: "native-text",
                severity: "error" as const,
                message: error.message,
                path: ["blocks", index],
                blockId: String(node.$?.id ?? ""),
              }
            : undefined;

      if (!diagnostic) throw error;

      if (!diagnostics) throw new NativeBindingError(diagnostic);
      diagnostics.push(diagnostic);
    }
  }

  let serviceName: RichText;

  try {
    serviceName = nodesToNativeText(first.children ?? []);
  } catch (error) {
    if (error instanceof NativeTextError)
      throw new NativeBindingError({
        code: "native-text",
        severity: "error",
        message: error.message,
        path: ["title"],
        blockId: form.id,
      });
    throw error;
  }

  if (typeof serviceName !== "string")
    return fail("The service name must be plain text in the native form format", form.id, [
      "title",
    ]);

  return { ...structuredClone(form), title: serviceName, blocks };
}
