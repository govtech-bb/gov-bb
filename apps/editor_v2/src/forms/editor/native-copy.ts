import { $getRoot, $getState, $setState, type LexicalNode } from "lexical";
import type {
  AnyFormBlock,
  AnyFormDefinition,
  NativeScalar,
  QuestionBase,
  ContentBase,
} from "../schema/types";
import { remapNativeForm, type NativeReference } from "../schema/references";
import { normalizeNativeRichText } from "../schema/semantics";
import { resolveNativeContent, resolveNativeField } from "../native";
import { $formDefinition } from "./context";
import { $native, $setNative, nativeBlockId, type NativeNodeData } from "./native-state";
import { $blockGroup, $isInput, $listRun, $questionKey, $settings, settingsState } from "./nodes";
import { nativeQuestionSettings } from "./native-settings";
import { $mentionsIn, nativeReferenceState } from "../features/mentions/node";

/** A new option preserves the question's scalar type; existing option values never change. */
export function unusedOptionValue(
  preferred: NativeScalar,
  values: readonly NativeScalar[],
): NativeScalar {
  if (!values.includes(preferred)) return preferred;

  if (typeof preferred === "string") {
    let index = 2,
      value = `${preferred}-${index}`;

    while (values.includes(value)) value = `${preferred}-${++index}`;

    return value;
  }

  if (typeof preferred === "number") {
    let value = 0;

    while (values.includes(value)) value++;

    return value;
  }

  // Both boolean values may already be taken; retain an editable invalid draft rather than change answer type.
  return values.includes(!preferred) ? preferred : !preferred;
}

/** Copy only declared semantic addresses. Literal text, submitted values, and external references stay intact. */
export function $remapNativeCopies(pairs: [LexicalNode, LexicalNode][]) {
  const definition = $formDefinition(),
    nodes = $getRoot().getChildren(),
    copies = new Set(pairs.map(([, copy]) => copy.getKey()));

  const blocks = new Map<string, string>(),
    keys = new Map<string, string>();

  const options = new Map<string, Map<string, string>>(),
    listItems = new Map<string, Map<string, string>>();

  const partialQuestions = new Set<string>(),
    partialLists = new Set<string>();

  const questionDestinations = new Map<string, NonNullable<NativeNodeData["question"]>>();

  const allocateLocal = (map: Map<string, Map<string, string>>, owner: string, id: string) => {
    const entries = map.get(owner) ?? new Map<string, string>();

    if (!entries.has(id)) entries.set(id, crypto.randomUUID());
    map.set(owner, entries);
  };

  for (const [original, copy] of pairs) {
    const state = $native(original),
      id = nativeBlockId(state);

    if (!id) continue;

    if (state.question) {
      const existing = $blockGroup(copy)
        .filter($isInput)
        .find((node) => !copies.has(node.getKey()));

      if (existing) {
        partialQuestions.add(id);
        const destination = $native(existing).question;

        if (destination) questionDestinations.set(copy.getKey(), destination);
      }
    }

    if (
      state.content?.kind === "list" &&
      state.listItem &&
      $listRun(copy).some((node) => !copies.has(node.getKey()))
    )
      partialLists.add(id);

    if (!blocks.has(id)) blocks.set(id, state.question ? $questionKey(copy) : crypto.randomUUID());

    if (state.question && state.option) allocateLocal(options, id, state.option.id);

    if (state.question) state.options?.forEach((option) => allocateLocal(options, id, option.id));

    if (state.content && state.listItem) allocateLocal(listItems, id, state.listItem.id);
  }

  for (const id of [...partialQuestions, ...partialLists]) blocks.delete(id);
  const scopeAt = new Map<string, string>();
  let scope = "form";

  for (const node of nodes) {
    const native = $native(node);

    if (native.page)
      scope = native.page.repeat
        ? copies.has(node.getKey())
          ? (blocks.get(native.page.id) ?? native.page.id)
          : native.page.id
        : "form";
    scopeAt.set(node.getKey(), scope);
  }

  const usedKeys = new Map<string, Set<string>>();

  const keySet = (scope: string) => {
    const set = usedKeys.get(scope) ?? new Set<string>();
    usedKeys.set(scope, set);

    return set;
  };

  for (const node of nodes)
    if (!copies.has(node.getKey())) {
      const state = $native(node),
        scope = scopeAt.get(node.getKey()) ?? "form";

      if (state.question) keySet(scope).add(state.question.key);

      if (state.calculated?.key !== undefined) keySet(scope).add(state.calculated.key);

      if (state.page?.repeat) keySet("form").add(state.page.repeat.key);
    }

  const allocateKey = (id: string, key: string, scope: string) => {
    if (keys.has(id)) return;
    const used = keySet(scope);

    let next = key,
      index = 2;

    while (used.has(next)) next = `${key}-${index++}`;
    keys.set(id, next);
    used.add(next);
  };

  for (const [original, copy] of pairs) {
    const state = $native(original),
      scope = scopeAt.get(copy.getKey()) ?? "form";

    if (state.question && !partialQuestions.has(state.question.id))
      allocateKey(state.question.id, state.question.key, scope);

    if (state.page?.repeat) allocateKey(state.page.id, state.page.repeat.key, "form");

    if (state.calculated?.key !== undefined)
      allocateKey(state.calculated.id, state.calculated.key, scope);
  }

  const mapReference = (reference: NativeReference): string =>
    reference.kind === "context"
      ? reference.id
      : reference.kind === "option"
        ? (options.get(reference.ownerId!)?.get(reference.id) ?? reference.id)
        : reference.kind === "list-item"
          ? (listItems.get(reference.ownerId!)?.get(reference.id) ?? reference.id)
          : (blocks.get(reference.id) ?? reference.id);

  const remap = (block: AnyFormBlock): AnyFormBlock => {
    const envelope: AnyFormDefinition = {
      schemaVersion: 2,
      id: "copy",
      title: "",
      mode: "application",
      locale: "en-BB",
      timeZone: "America/Barbados",
      settings: { visibility: "draft", hiddenAnswers: "retain" },
      blocks: [block],
    };

    const remapped = remapNativeForm(envelope, { blocks, keys, options, listItems }).blocks[0]!;

    if (remapped.type === "question")
      return (
        resolveNativeField(remapped, definition)?.native?.references?.(remapped, mapReference) ??
        remapped
      );

    if (remapped.type === "content")
      return (
        resolveNativeContent(remapped, definition)?.native?.references?.(remapped, mapReference) ??
        remapped
      );

    return remapped;
  };

  const partialValues = new Map<string, NativeScalar[]>();

  for (const [original, copy] of pairs) {
    const source = $native(original).question;

    if (!source || !partialQuestions.has(source.id)) continue;
    const id = questionDestinations.get(copy.getKey())?.id ?? source.id;

    if (partialValues.has(id)) continue;
    partialValues.set(
      id,
      nodes
        .filter((node) => !copies.has(node.getKey()) && $native(node).question?.id === id)
        .flatMap((node) => ($native(node).option ? [$native(node).option!.value] : [])),
    );
  }

  for (const [original, copy] of pairs) {
    const state = $native(original),
      next: NativeNodeData = structuredClone(state),
      destination = questionDestinations.get(copy.getKey());

    // Partial option copies join the destination question; whole-question copies retain remapped metadata.
    if (destination) next.question = structuredClone(destination);
    else if (state.question) {
      const question: QuestionBase = { ...state.question, label: "" };

      if (state.options) question.options = state.options;
      const value = remap(question);

      if (value.type === "question") {
        const { label: _, options: nativeOptions, ...metadata } = value;
        next.question = metadata;

        if (nativeOptions) next.options = nativeOptions;
      }
    }

    if (state.page) {
      const value = remap({ ...state.page, title: "" });

      if (value.type === "page") {
        const { title: _, ...metadata } = value;
        next.page = metadata;
      }
    }

    if (state.content) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Copying retains opaque content configuration from the editable draft; validateFormDefinition checks it when exporting.
      const config = state.content.config as Record<string, unknown> | undefined;

      const structural =
        state.content.kind === "list"
          ? "items"
          : state.content.kind === "expandable"
            ? "blocks"
            : undefined;

      const content: ContentBase = { ...state.content, content: "" };

      if (structural) content.config = { ...config, [structural]: config?.[structural] ?? [] };
      const value = remap(content);

      if (value.type === "content") {
        const { content: _, ...metadata } = value;

        if (structural && !Object.hasOwn(config ?? {}, structural))
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The remapped draft config temporarily contains a structural collection; remove only the injected property before export validation.
          delete (metadata.config as Record<string, unknown>)[structural];
        next.content = metadata;
      }
    }

    if (state.logic) {
      const logic = remap(state.logic);

      if (logic.type === "logic") next.logic = logic;
    }

    if (state.calculated) {
      const calculated = remap(state.calculated);

      if (calculated.type === "calculated") next.calculated = calculated;
    }

    for (const key of ["owner", "container", "hintOwner"] as const)
      if (state[key]) next[key] = blocks.get(state[key]!) ?? state[key];

    if (destination) next.owner = destination.id;

    if (state.option && state.question) {
      const used = partialValues.get(destination?.id ?? state.question.id),
        value = used ? unusedOptionValue(state.option.value, used) : state.option.value;

      if (used) used.push(value);
      next.option = {
        ...state.option,
        id: options.get(state.question.id)?.get(state.option.id) ?? state.option.id,
        value,
      };
    }

    if (state.listItem && state.content)
      next.listItem = {
        ...state.listItem,
        id: listItems.get(state.content.id)?.get(state.listItem.id) ?? state.listItem.id,
      };

    if (Object.keys(next).length) $setNative(copy, next);

    if (next.question)
      $setState(copy, settingsState, {
        ...$settings(copy),
        ...nativeQuestionSettings(next.question),
        ...(next.option && { optionValue: next.option.value }),
      });

    // Accordion copies need one coherent projection; the old copy hook also generates temporary option IDs.
    if (next.question?.kind === "choice" && next.options) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Accordion copies retain the editor configuration; this projection is not proof of a valid published choice schema.
      const config = next.question.config as {
        groups?: {
          id: string;
          label: import("../schema/types").RichText;
          higherRisk?: boolean;
          optionIds: string[];
        }[];
      };

      if (config.groups) {
        const plain = (value: import("../schema/types").RichText) => {
          const text = normalizeNativeRichText(value);

          return typeof text === "string"
            ? text
            : text
                .map((part) =>
                  typeof part === "string"
                    ? part
                    : "text" in part
                      ? part.text
                      : "break" in part
                        ? "\n"
                        : "",
                )
                .join("");
        };

        const optionsById = new Map(next.options.map((option) => [option.id, option]));
        $setState(copy, settingsState, {
          ...$settings(copy),
          groups: config.groups.map((group) => {
            const settings: import("../core/settings").Settings = {
              id: group.id,
              label: plain(group.label),
              options: group.optionIds.flatMap((id) => {
                const option = optionsById.get(id);

                return option
                  ? [{ id, label: plain(option.label), optionValue: String(option.value) }]
                  : [];
              }),
            };

            if (group.higherRisk !== undefined) settings.higherRisk = group.higherRisk;

            return settings;
          }),
        });
      }
    }

    for (const mention of $mentionsIn(copy)) {
      const reference = $getState(mention, nativeReferenceState);

      if (!reference) continue;

      const value = remap({
        id: "mention",
        type: "content",
        kind: "paragraph",
        content: [reference],
      });

      if (value.type === "content" && Array.isArray(value.content)) {
        const reference = value.content[0];

        if (
          reference &&
          typeof reference === "object" &&
          ("answer" in reference || "value" in reference || "context" in reference)
        )
          $setState(mention, nativeReferenceState, reference);
      }
    }
  }
}
