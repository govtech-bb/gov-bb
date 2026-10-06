import { $getRoot, $setState, RootNode, type LexicalEditor } from "lexical";
import { $native, $setNative, type NativeNodeData } from "./native-state";
import {
  applyNativeQuestionSettings,
  nativeQuestionSettings,
  $setFormSettings,
} from "./native-settings";
import {
  $blockGroup,
  $blockId,
  $fieldForNode,
  $formBlocks,
  $isInput,
  $isOptionNode,
  $isPageBreak,
  $isPageHead,
  $isQuestionNode,
  $listRun,
  $pageHead,
  $questionKey,
  $settings,
} from "./nodes";
import { $installedContent } from "./field-context";
import { sourceSlug } from "../source/identifiers";
import { nativeCapabilityMatches } from "../schema/validation";
import type { NativeScalar } from "../schema/types";
import { settingsState } from "../../editor/core/document-state";
import { compileGroups, groupedChoices } from "../features/checkbox-accordion/groups";
import { unusedOptionValue } from "./native-copy";

/** Authoring assigns identities once. Export remains a pure read, including unfinished new blocks. */
export function $bindNativeAuthoring(root = $getRoot()) {
  if (!root.getFirstChild() || !$native(root.getFirstChild()!).form) return;
  const nodes = $formBlocks(root);

  // Bind page ownership before questions so new repeated pages get their own submitted-key namespace.
  for (const node of nodes)
    if ($isPageBreak(node) && !$native(node).page) {
      const settings = $settings(node);
      $setNative(node, {
        page: {
          id: $blockId(node),
          type: "page",
          role: settings.confirmation
            ? "confirmation"
            : settings.pageType === "check-answers"
              ? "review"
              : settings.pageType === "declaration"
                ? "declaration"
                : settings.pageType === "result"
                  ? "result"
                  : "questions",
          ...(settings.pageType === "check-answers" && {
            review: { questions: "preceding", emptyAnswers: "omit", changeLinks: true },
          }),
        },
      });
      $setFormSettings(node, settings);

      for (const head of $pageHead(node)) $setNative(head, { owner: $native(node).page!.id });
    }

  const scopes = new Map<string, string>(),
    usedKeys = new Map<string, Set<string>>();

  const keys = (scope: string) => {
    const set = usedKeys.get(scope) ?? new Set<string>();
    usedKeys.set(scope, set);

    return set;
  };

  let scope = "form";

  for (const node of nodes) {
    const native = $native(node);

    if (native.page) {
      scope = native.page.repeat ? native.page.id : "form";

      if (native.page.repeat) keys("form").add(native.page.repeat.key);
    }

    scopes.set(node.getKey(), scope);

    if (native.question) keys(scope).add(native.question.key);

    if (native.calculated?.key !== undefined) keys(scope).add(native.calculated.key);
  }

  const uniqueKey = (base: string, scope: string) => {
    const used = keys(scope);

    let key = base,
      n = 2;

    while (used.has(key)) key = `${base}-${n++}`;
    used.add(key);

    return key;
  };

  for (const node of nodes) {
    const field = $isInput(node) ? $fieldForNode(node) : undefined;

    if (!field?.native) continue;

    const group = $blockGroup(node),
      answers = group.filter($isInput),
      existing = answers.find((answer) => $native(answer).question),
      label = group.find($isQuestionNode);

    let metadata: NonNullable<NativeNodeData["question"]> = existing
      ? $native(existing).question!
      : applyNativeQuestionSettings(
          {
            id: $questionKey(node),
            type: "question",
            kind: field.native.kind,
            key: uniqueKey(
              String($settings(node).fieldId ?? sourceSlug(label?.getTextContent() || field.kind)),
              scopes.get(node.getKey()) ?? "form",
            ),
            ...(field.native.config && { config: { ...field.native.config } }),
          },
          $settings(node),
          $settings(node),
        );

    const initialGroups =
      !existing &&
      field.native.kind === "choice" &&
      field.native.config?.presentation === "accordion"
        ? compileGroups(groupedChoices($settings(node)))
        : undefined;

    if (initialGroups)
      metadata = {
        ...metadata,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Changing a draft field retains existing configuration while adding accordion groups; native export validation checks the resulting config.
        config: { ...(metadata.config as object), groups: initialGroups.groups },
      };
    const changedKind = !nativeCapabilityMatches(field.native, metadata);

    if (changedKind) {
      const priorConfig =
        metadata.config && typeof metadata.config === "object" ? metadata.config : {};

      metadata = { ...metadata, kind: field.native.kind };

      if (field.native.config) metadata.config = { ...priorConfig, ...field.native.config };

      if (
        field.native.config?.selection === "multiple" &&
        metadata.default !== undefined &&
        !Array.isArray(metadata.default)
      )
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Changing to multiple choice retains the authored default even when incompatible; native export must report that default rather than erase it.
        metadata = { ...metadata, default: [metadata.default as NativeScalar] };

      if (
        field.native.config?.selection === "single" &&
        Array.isArray(metadata.default) &&
        metadata.default.length === 1
      )
        metadata = { ...metadata, default: metadata.default[0] };
    }

    if (label && $native(label).owner !== metadata.id)
      $setNative(label, { owner: metadata.id, part: "label" });

    for (const hint of group.filter((member) => member !== label && !answers.includes(member)))
      if (!$native(hint).owner && !$native(hint).hintOwner)
        // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- hintShape is a persisted Markdown metadata key; renaming would discard saved hint representation.
        $setNative(hint, { owner: metadata.id, part: "hint", hintShape: "rich" });

    const values = answers.flatMap((answer) =>
      $native(answer).option ? [$native(answer).option!.value] : [],
    );

    for (const answer of answers) {
      const native = $native(answer);

      if (native.question) {
        if (changedKind) {
          $setNative(answer, { question: metadata });
          $setState(answer, settingsState, {
            ...$settings(answer),
            ...nativeQuestionSettings(metadata),
          });
        }

        continue;
      }

      let option: NativeNodeData["option"];

      if ($isOptionNode(answer)) {
        const raw = $settings(answer).optionValue;

        const preferred =
          typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
            ? raw
            : typeof values[0] === "number"
              ? 0
              : typeof values[0] === "boolean"
                ? false
                : sourceSlug(answer.getTextContent() || `option-${$blockId(answer)}`);

        option = { id: $blockId(answer), value: unusedOptionValue(preferred, values) };
        values.push(option.value);
      }

      $setNative(answer, {
        question: metadata,
        owner: metadata.id,
        part: option ? "option" : "input",
        ...(option && { option }),
        ...(initialGroups && { options: initialGroups.options }),
      });
      $setState(answer, settingsState, {
        ...$settings(answer),
        ...nativeQuestionSettings(metadata),
        ...(option && { optionValue: option.value }),
      });
    }
  }

  for (const node of nodes) {
    const native = $native(node);

    if (
      native.form ||
      native.page ||
      $isPageHead(node) ||
      native.owner ||
      native.hintOwner ||
      native.question ||
      native.content ||
      native.logic ||
      native.calculated
    )
      continue;
    const content = $installedContent(node);

    if (!content?.native) continue;

    if (content.native.blockType === "logic") {
      $setNative(node, {
        logic: {
          id: $blockId(node),
          type: "logic",
          rules: [{ id: crypto.randomUUID(), when: true, actions: [] }],
        },
      });
      continue;
    }

    if (content.native.blockType === "calculated") {
      $setNative(node, {
        calculated: { id: $blockId(node), type: "calculated", valueType: "number" },
      });
      continue;
    }

    const metadata = {
      id: $blockId(node),
      type: "content" as const,
      kind: content.native.kind,
      ...(content.native.config && { config: { ...content.native.config } }),
    };

    if (metadata.kind === "list") {
      const lines = $listRun(node),
        owner = lines.find((line) => $native(line).content)?.getLatest(),
        shared = owner ? $native(owner).content! : metadata;

      for (const line of lines)
        if (!$native(line).listItem)
          $setNative(line, {
            content: shared,
            owner: shared.id,
            part: "list-item",
            listItem: { id: $blockId(line) },
          });
    } else $setNative(node, { content: metadata });
  }
}

export const registerNativeAuthoring = (editor: LexicalEditor) =>
  editor.registerNodeTransform(RootNode, $bindNativeAuthoring);
