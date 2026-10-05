import { $isHeadingNode } from "@lexical/rich-text";
import { $isParagraphNode, type LexicalNode } from "lexical";
import { $installedField } from "../../editor/field-context";
import {
  $pageTitle,
  $typedPageTitle,
  $blockGroup,
  $blockKind,
  $canBeConfirmationPage,
  $depth,
  $formBlocks,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $pageBlocks,
  $pageType,
  $questionKey,
  $settings,
} from "../../editor/nodes";
import { $ssbIds } from "../../editor/ssb";
import { $native } from "../../editor/native-state";
import { $pageHead } from "../../editor/nodes";
import { $pageRepeat, $repeatEnd } from "../repetition/queries";
import { instanceMarker, repeatSummary } from "../../core/repetition";

function $questionLabel(input: LexicalNode) {
  const title = $blockGroup(input).find($isQuestionNode)?.getTextContent().trim();
  const field = $installedField($blockKind(input));

  return (
    title || String($settings(input).name ?? "").trim() || field?.untitled || "Unlabelled question"
  );
}

// SSB's applicant-name-display.tsx matches effective IDs without hyphens or underscores.
const nameIds = [
  ["firstname", "applicantfirstname", "parentfirstname", "yourfirstname"],
  [
    "middlename",
    "applicantmiddlename",
    "othernames",
    "applicantothernames",
    "parentmiddlenames",
    "yourmiddlename",
  ],
  ["lastname", "applicantlastname", "parentlastname", "yourlastname"],
];

/** The generated parts of a page, and the rules its gap warns about. */
export function $pagePreview(start: LexicalNode) {
  const type = $pageType(start);
  const native = $native(start).page;
  const blocks = $pageBlocks(start);
  const all = $formBlocks();
  const starts = all.filter((block, index) => index === 0 || $isPageBreak(block));
  const index = starts.indexOf(start);
  const warnings: string[] = [];

  const sections: {
    key: string;
    title: string;
    rows: { key: string; label: string }[];
    repeat?: string;
  }[] = [];

  let applicant = "";

  if (type === "check-answers") {
    if (!native && blocks.length) warnings.push("This page summarizes answers from the form");

    if (starts.slice(0, index).some((page) => $pageType(page) === "declaration"))
      warnings.push("Check answers goes before the declaration");

    for (const [i, page] of starts.slice(0, index).entries()) {
      if ($pageType(page) !== "questions") continue;
      const content = $pageBlocks(page);

      const heading = content.find(
        (block) =>
          ($isHeadingNode(block) || $isQuestionNode(block)) && block.getTextContent().trim(),
      );

      const rows = content
        .filter((block) => $isInput(block) && $blockGroup(block).find($isInput) === block)
        .flatMap((input) => {
          if ($native(input).question?.review === false) return [];
          const answers = $blockGroup(input).filter($isInput);

          if (answers.every((answer) => $settings(answer).hidden)) return [];

          return [{ key: input.getKey(), label: $questionLabel(input) }];
        });

      const repeat = $pageRepeat(page)?.value;
      sections.push({
        key: page.getKey(),
        title: $typedPageTitle(page) || heading?.getTextContent().trim() || `Page ${i + 1}`,
        rows,
        ...(repeat && { repeat: instanceMarker(repeat, 2) }),
      });
    }
  }

  if (type === "declaration" && !native) {
    const option = blocks.findLast($isOptionNode);
    const after = option ? blocks.slice(blocks.indexOf(option) + 1) : [];

    const tail =
      option && after.every((block) => $isListLine(block) && $depth(block) === $depth(option))
        ? after
        : [];

    const content = tail.length ? blocks.slice(0, -tail.length) : blocks;

    if (
      !$isQuestionNode(content[0]) ||
      !$isOptionNode(option) ||
      content.at(-1) !== option ||
      $blockKind(option) !== "checkboxes" ||
      !content.slice(1, -1).every($isParagraphNode)
    )
      warnings.push("Only the declaration checkbox belongs here");

    if (starts.slice(index + 1).some((page) => $pageType(page) !== "confirmation"))
      warnings.push("The declaration goes just before the confirmation page");
    const ids = $ssbIds();

    const parts = nameIds.map((names) => {
      const input = all.find(
        (block) =>
          $isInput(block) &&
          names.includes(
            (ids.fields.get($questionKey(block))?.id ?? "").toLowerCase().replace(/[-_]/g, ""),
          ),
      );

      return input ? `[${$questionLabel(input)}]` : "";
    });

    if (parts[0] || parts[2]) applicant = parts.filter(Boolean).join(" ");
  }

  if (type === "confirmation" && !$canBeConfirmationPage(start))
    warnings.push(
      "Keep only text, headings and lists on the confirmation page. Move other blocks to an earlier page.",
    );
  const repeat = $pageRepeat(start)?.value;

  return {
    native: !!native,
    headKey: $pageHead(start).at(-1)?.getKey(),
    changeLinks: native?.review?.changeLinks !== false,
    service: all[0]?.getTextContent().trim() ?? "",
    title: $pageTitle(start),
    typedTitle: $typedPageTitle(start),
    type,
    qualified:
      type === "confirmation" || (type === "questions" && $canBeConfirmationPage(start) && !repeat),
    count: blocks.length,
    warnings,
    sections,
    applicant,
    repeatChip: repeat ? repeatSummary(repeat) : undefined,
    repeatRoom: index > 0 ? $repeatEnd(starts[index - 1]!) : null,
  };
}
