import type { LexicalNode } from "lexical";
import type { WordingTarget } from "../../core/dynamic-text";
import { $fields, type Field } from "./queries";
import { $hiddenWithoutShow, $logicLinks, $showCoveredKeys } from "./authoring";
import {
  $blockGroup,
  $blockId,
  $formBlocks,
  $isInput,
  $isPageBreak,
  $isPageTitleNode,
  $isQuestionNode,
  $pageTitle,
  $pageType,
  $questionKey,
  $settings,
} from "../../editor/nodes";
import { $installedField } from "../../editor/field-context";
import { $pageRepeat } from "../repetition/queries";
import { $ssbIds } from "../../editor/ssb";

type Choice = Omit<Field, "options"> &
  WordingTarget & { before: boolean; repeating: boolean; optionLabels: [string, string][] };

function $pageFor(node: LexicalNode) {
  const blocks = $formBlocks();

  return blocks
    .slice(0, blocks.indexOf(node) + 1)
    .findLast((block, index) => index === 0 || $isPageBreak(block))!;
}

export function $wordingSource(node: LexicalNode) {
  const title = $isPageTitleNode(node) ? node : $blockGroup(node).find($isQuestionNode);

  if (!title) return undefined;
  const page = $pageFor(title);

  if (!page || ["declaration", "check-answers"].includes($pageType(page))) return undefined;
  const holder = $isPageTitleNode(title) ? title : $blockGroup(title).find($isInput);

  if (!holder) return undefined;
  const isPage = $isPageTitleNode(title);

  return {
    titleKey: title.getKey(),
    holderKey: holder.getKey(),
    target: isPage ? ($isPageBreak(page) ? $blockId(page) : "start") : $questionKey(holder),
    label: isPage ? "title" : "label",
    fallback: title.getTextContent() || (isPage ? $pageTitle(page) : "Unlabelled question"),
  } as const;
}

export function $wordingChoices(title: LexicalNode): Choice[] {
  const blocks = $formBlocks();
  const ids = $ssbIds();
  const page = $pageFor(title);

  return $fields()
    .filter((field) => field.type === "INPUT_FIELD")
    .flatMap((field) => {
      const input = blocks.find((block) => $isInput(block) && $questionKey(block) === field.key);

      if (!input) return [];
      const sourcePage = $pageFor(input);
      const fieldId = ids.fields.get(field.key)?.id;
      const stepId = ids.pages.get(sourcePage.getKey())?.id;

      if (!fieldId || !stepId) return [];

      const options =
        legacyFieldAdapter($installedField(field.kind))?.project?.($settings(input)).options ??
        (field.options ?? []).map(([id]) => {
          const node = blocks.find((block) => $blockId(block) === id);

          return { id, value: node ? (ids.options.get(node.getKey())?.id ?? id) : id };
        });

      return [
        {
          ...field,
          fieldId,
          stepId,
          options,
          optionLabels: field.options ?? [],
          before: blocks.indexOf(input) < blocks.indexOf($isPageTitleNode(title) ? page : title),
          repeating: !!$pageRepeat(sourcePage)?.value || !!$settings(input).fieldArray,
        },
      ];
    });
}

export type RuleLinkSource = NonNullable<ReturnType<typeof $wordingSource>> & {
  links: ReturnType<typeof $logicLinks>;
  hidden?: "whole" | "part";
};

/** One row per question, including unlabelled inputs; page headings keep their wording links. */
export function $ruleLinkSources(): RuleLinkSource[] {
  const covered = $showCoveredKeys();
  const sources: RuleLinkSource[] = [];

  for (const node of $formBlocks()) {
    if ($isPageTitleNode(node)) {
      const source = $wordingSource(node);

      if (source) sources.push({ ...source, links: $logicLinks([source.target]) });
    } else if ($isInput(node)) {
      const group = $blockGroup(node);

      if (!group.find($isInput)?.is(node)) continue;
      const title = group.find($isQuestionNode);
      const target = $questionKey(node);
      const hidden = $hiddenWithoutShow(node, covered);
      sources.push({
        titleKey: (title ?? node).getKey(),
        holderKey: node.getKey(),
        target,
        label: "label",
        fallback:
          title?.getTextContent().trim() ||
          String($settings(node).name ?? "").trim() ||
          "Unlabelled question",
        links: $logicLinks([target, `${target}:${target}`, ...group.map($blockId)]),
        ...(hidden.length && { hidden: hidden.length === group.length ? "whole" : "part" }),
      });
    }
  }

  return sources;
}

import { legacyFieldAdapter } from "../../editor/legacy-mappings";
