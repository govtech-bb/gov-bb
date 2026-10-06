import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  type LexicalNode,
  RootNode,
} from "lexical";
import { $installedField, $installedContent } from "../../editor/field-context";
import { $fields, metadataFields, type Field } from "../logic/queries";
import { calculatedFields, fieldKey } from "../../core/logic";
import {
  $blockId,
  $blockKind,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $isInput,
  $isPageBreak,
  $prevBlock,
  $questionKey,
  $settings,
  settingsState,
} from "../../editor/nodes";
import { remapKnownSettings, remapReference } from "../../core/references";
import { $ensureSourceKeys, sourceAnchorState } from "../../editor/source-keys";
import {
  $mentionsIn,
  $mentionField,
  fieldState,
  mentionLabel,
  $nativeMentionReference,
} from "./node";
import { $native } from "../../editor/native-state";
import { $remapNativeCopies } from "../../editor/native-copy";
import { $nativeTargets } from "../logic/native-authoring";
import type { DisplayReference } from "../../schema/types";

/**
 * Remap references within copied blocks to their copies; references outside the copied group keep their originals.
 * Takes [original, copy] pairs after the copies have been inserted.
 */
export function $remapCopies(pairs: [original: LexicalNode, copy: LexicalNode][]) {
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());
  const ids = new Map(pairs.map(([original, copy]) => [$blockId(original), $blockId(copy)]));

  for (const [original, copy] of pairs) {
    const ownedIds = $isInput(original) && $installedField($blockKind(original))?.ownedIds;

    if (!ownedIds) continue;

    const before = ownedIds($settings(original)),
      after = ownedIds($settings(copy));

    before.forEach((id, index) => {
      if (after[index]) ids.set(id, after[index]!);
    });
  }

  for (const [original, copy] of pairs)
    if ($isInput(original) && $isInput(copy) && $questionKey(original) !== $questionKey(copy))
      ids.set($questionKey(original), $questionKey(copy));

  const choiceFields = new Set(
    $formBlocks()
      .filter($isInput)
      .filter(
        (node) =>
          !!(
            $installedField($blockKind(node))?.source.choice ||
            $installedField($blockKind(node))?.source.referencesOptions
          ),
      )
      .map($questionKey),
  );

  for (const [, copy] of pairs) {
    const settings = remapKnownSettings($settings(copy), ids, {
      choiceFields,
      optionAliases: ids,
      fieldReferences: ($isInput(copy)
        ? $installedField($blockKind(copy))
        : $installedContent(copy)
      )?.source.mapReferences,
    });

    delete settings.sourceKey;

    for (const property of ["conditionalTitle", "conditionalLabel"])
      if (Array.isArray(settings[property]))
        settings[property] = settings[property].map((row) =>
          row && typeof row === "object" && !Array.isArray(row)
            ? { ...row, id: crypto.randomUUID() }
            : row,
        );
    $setState(copy, settingsState, settings);
    $setState(copy, sourceAnchorState, "");

    for (const mention of $mentionsIn(copy))
      $setState(mention, fieldState, remapReference($mentionField(mention), ids));
  }

  $ensureSourceKeys();
  $remapNativeCopies(pairs);
}

/** Calculated fields remain referenceable while their name or type is incomplete. */
export function $mentionTargets() {
  const targets = new Map(
    [...metadataFields, ...$fields()].map((f) => [f.key, mentionLabel(f.title)]),
  );

  for (const block of $formBlocks()) {
    const [kind, id, s] = [$blockKind(block), $blockId(block), $settings(block)];

    if (kind === "calculated-fields")
      for (const f of calculatedFields(s)) targets.set(fieldKey(id, f.id), `@${f.name ?? ""}`);
  }

  const native = $nativeTargets();

  for (const question of native.questions)
    targets.set(question.value, mentionLabel(question.label));

  for (const value of native.calculated) targets.set(value.value, mentionLabel(value.label));

  return targets;
}

/**
 * Mentions follow their field's name. A missing target stays in the source so it can be repaired or undone.
 */
export function $updateMentions(root: RootNode, _known: Set<string>) {
  const mentions = $mentionsIn(root);

  if (!mentions.length) return;
  const targets = $mentionTargets();

  for (const mention of mentions) {
    const native = $nativeMentionReference(mention);

    if (native && "context" in native) {
      const label = mentionLabel(
        {
          today: "Today",
          submissionReference: "Submission reference",
          submittedAt: "Submission date and time",
        }[native.context],
      );

      if (mention.getTextContent() !== label) mention.setTextContent(label);
      continue;
    }

    const field = $mentionField(mention);

    if (targets.has(field) && mention.getTextContent() !== targets.get(field))
      mention.setTextContent(targets.get(field)!);
  }
}

/** What "@" offers in the block with the caret: fields above it, and metadata on 'Confirmation' pages. */
export type MentionTarget = Field & { nativeReference?: DisplayReference };

export function $mentionable(): MentionTarget[] {
  const selection = $getSelection();

  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;

  if ($formBlocks().some((node) => $native(node).form)) {
    const targets = $nativeTargets();
    let role = "questions";

    for (const node of $formBlocks()) {
      if ($native(node).page) role = $native(node).page!.role;

      if (node.is(block)) break;
    }

    const contexts =
      role === "confirmation"
        ? (["today", "submissionReference", "submittedAt"] as const)
        : (["today"] as const);

    return [
      ...contexts.map((context) => ({
        key: `context:${context}`,
        kind: context,
        type: "METADATA" as const,
        title: {
          today: "Today",
          submissionReference: "Submission reference",
          submittedAt: "Submission date and time",
        }[context],
        nativeReference: { context },
      })),
      ...targets.questions.map((question) => ({
        key: question.value,
        kind: question.kind,
        type: "INPUT_FIELD" as const,
        title: question.label,
        nativeReference: { answer: question.value },
      })),
      ...targets.calculated.map((value) => ({
        key: value.value,
        kind: "NUMBER",
        type: "CALCULATED_FIELD" as const,
        title: value.label,
        nativeReference: { value: value.value },
      })),
    ];
  }

  let page = block && $prevBlock(block);

  while (page && !$isPageBreak(page)) page = $prevBlock(page);

  const fields = $fields({ before: block }).filter(
    (f) => $installedField(f.kind)?.capabilities.mention !== false,
  );

  return page && $settings(page).confirmation ? [...metadataFields, ...fields] : fields;
}
