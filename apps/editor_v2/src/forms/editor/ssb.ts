import { $isHeadingNode } from "@lexical/rich-text";
import { format } from "date-fns";
import type { ErrorMessage, Rule, RuleName } from "../adapters/ssb/rules";
import { parseDay } from "../core/dates";
import {
  autoId,
  type IdItem,
  RESERVED_PAGE_IDS,
  type Resolved,
  resolveIds,
} from "../core/identities";
import { $installedContent, $installedContents, $installedField } from "./field-context";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $formBlocks,
  $isInput,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $pageBlocks,
  $pageType,
  $questionKey,
  $setSettings,
  $settings,
  $typedPageTitle,
  type Setting,
  type Settings,
} from "./nodes";
import { formatMessage, presetOf } from "./preset-settings";

export {
  autoId,
  checkId,
  KEBAB_ID_PATTERN,
  RESERVED_PAGE_IDS,
  resolveIds,
  slug,
  type Resolved,
} from "../core/identities";

import { isFieldless } from "../adapters/ssb/rules";

export { isFieldless } from "../adapters/ssb/rules";

export type { ErrorMessage, Rule, RuleName } from "../adapters/ssb/rules";

export function rulesFor(kind: string, settings: Settings, _optionCount: number): Rule[] {
  return legacyFieldAdapter($installedField(kind))?.rules(settings) ?? [];
}

const kindName = (kind: string) =>
  $installedField(kind)?.label ??
  $installedContents().find((content) => content.kind === kind)?.label ??
  kind;

const dateText = (value: Setting | undefined) => {
  const day = parseDay(value);

  return day ? format(day, "d MMMM yyyy") : String(value ?? "");
};

export function defaultMessage(
  rule: RuleName,
  ctx: { kind: string; label: string; optionCount: number; value?: Setting },
) {
  const { kind, value } = ctx;
  const own = legacyFieldAdapter($installedField(kind))?.message?.(rule, ctx);

  if (own !== undefined) return own;
  const label = ctx.label.trim() || kindName(kind);
  const question = label.endsWith("?");

  const phrase = (label.replace(/[?:]$/, "").trim() || kindName(kind)).replace(
    /^[A-Z][a-z]/,
    (start) => start[0]!.toLowerCase() + start[1],
  );

  const capital = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  const answer = question ? "Your answer" : capital;
  const date = question ? "The date" : capital;

  switch (rule) {
    case "required": {
      if (question) return `Answer “${label}”`;
      const message = `Enter ${phrase}`;

      return isFieldless(message) ? `Answer “${label}”` : message;
    }

    case "minLength":
      return `${answer} must be ${value} characters or more`;
    case "maxLength":
      return `${answer} must be ${value} characters or less`;
    case "min":
      return `${answer} must be ${value} or more`;
    case "max":
      return `${answer} must be ${value} or less`;
    case "email":
      return "Enter an email address in the correct format, like name@example.com";
    case "phone":
      return "Enter a telephone number, like 246 123 4567";
    case "before":
      return `${date} must be before ${dateText(value)}`;
    case "after":
      return `${date} must be after ${dateText(value)}`;
    case "onOrAfter":
    case "onOrBefore": {
      const range = value && typeof value === "object" && !Array.isArray(value) ? value : undefined;

      if (range?.from && range.to)
        return `${date} must be between ${dateText(range.from)} and ${dateText(range.to)}`;

      return `${date} must be on or ${rule === "onOrAfter" ? "after" : "before"} ${dateText(range?.from ?? range?.to ?? value)}`;
    }

    case "past":
      return `${date} must be in the past`;
    case "pastOrToday":
      return `${date} must be today or in the past`;
    case "future":
      return `${date} must be in the future`;
    case "futureOrToday":
      return `${date} must be today or in the future`;
    case "pattern":
      return (
        formatMessage(String(value ?? ""), answer) ??
        `Enter ${question ? "your answer" : phrase} in the correct format`
      );
    case "minSelection":
      return `Select at least ${value}`;
    case "maxSelection":
      return `Select no more than ${value}`;
    case "fileTypes":
    case "itemMaxSize":
    case "minItems":
    case "maxItems":
      return "Check this file";
  }
}

/** A date range has two rules, but one authored message, stored under onOrAfter. */
export function messagesFor(
  kind: string,
  settings: Settings,
  optionCount: number,
  label: string,
): ErrorMessage[] {
  const errors =
    settings.errors && typeof settings.errors === "object" && !Array.isArray(settings.errors)
      ? settings.errors
      : {};

  return rulesFor(kind, settings, optionCount).map(({ rule, label: ruleLabel, value }) => {
    const range = rule === "onOrAfter" || rule === "onOrBefore";
    const given = errors[range ? "onOrAfter" : rule];
    const pinned = typeof given === "string" && !!given.trim();

    const fallback = defaultMessage(rule, {
      kind,
      label: label.trim() || String(settings.name ?? ""),
      optionCount,
      value: range ? settings.dateRange : value,
    });

    return {
      rule,
      label: ruleLabel,
      message: pinned ? given : fallback,
      default: fallback,
      pinned,
    };
  });
}

export {
  DEFAULT_FILE_TYPES,
  FILE_TYPES,
  fileExtensions,
  fileTypesOf,
} from "../features/file-upload/files";

/** SSB IDs are separate from the stable keys used by logic and mentions. */
export function $ssbIds() {
  const blocks = $formBlocks();
  const starts = blocks.filter((block, index) => index === 0 || $isPageBreak(block));
  const fixedPages = new Map<string, string>();

  for (const [type, id] of Object.entries({
    "check-answers": "check-your-answers",
    declaration: "declaration",
    confirmation: "submission-confirmation",
  })) {
    const start = starts.find((start) => $pageType(start) === type);

    if (start) fixedPages.set(start.getKey(), id);
  }

  const declaration = starts.find((start) => $pageType(start) === "declaration");
  const confirmation = declaration && $pageBlocks(declaration).find($isInput);
  const fields: IdItem[] = [];
  const options = new Map<string, Resolved>();
  const seen = new Set<string>();

  for (const block of blocks) {
    const content = $installedContent(block);

    if (content?.fieldId) {
      const settings = $settings(block);
      fields.push({
        key: $blockId(block),
        pinned: typeof settings.fieldId === "string" ? settings.fieldId : undefined,
        auto: content.fieldId(block.getTextContent().trim()),
      });
    }

    if (!$isInput(block)) continue;
    const key = $questionKey(block);

    if (seen.has(key)) continue;
    seen.add(key);
    const group = $blockGroup(block);
    const settings = $settings(block);
    const preset = presetOf(settings, $blockKind(block));
    const title = group.find($isQuestionNode)?.getTextContent().trim();
    fields.push({
      key,
      pinned: typeof settings.fieldId === "string" ? settings.fieldId : undefined,
      auto:
        preset && title === settings.sourceLabel && typeof settings.sourceFieldId === "string"
          ? settings.sourceFieldId
          : autoId(
              title || String(settings.name ?? "").trim() || kindName($blockKind(block)),
              "field",
              "field-",
            ),
      fixed: block === confirmation ? "declaration-confirmed" : undefined,
    });

    const items = group.filter($isOptionNode).map((option, index): IdItem => {
      const own = $settings(option);
      const copied = typeof own.sourceOptionValue === "string" ? own.sourceOptionValue : undefined;

      return {
        key: option.getKey(),
        pinned: typeof own.optionValue === "string" ? own.optionValue : undefined,
        auto: own.other
          ? "other"
          : (copied ?? autoId(option.getTextContent(), `option-${index + 1}`, "option-")),
      };
    });

    for (const [key, value] of resolveIds(items, new Set(), (value) => !!value.trim()))
      options.set(key, value);
  }

  const pages = resolveIds(
    starts.map((start): IdItem => {
      const index = starts.indexOf(start);
      const next = starts[index + 1];

      const content = blocks.slice(
        blocks.indexOf(start) + 1,
        next ? blocks.indexOf(next) : blocks.length,
      );

      const heading = content.find(
        (block) =>
          ($isQuestionNode(block) || $isHeadingNode(block)) && block.getTextContent().trim(),
      );

      const settings = $settings(start);

      return {
        key: start.getKey(),
        pinned: typeof settings.pageId === "string" ? settings.pageId : undefined,
        auto: autoId(
          $typedPageTitle(start) || heading?.getTextContent() || "",
          `page-${index + 1}`,
          "page-",
        ),
        fixed: fixedPages.get(start.getKey()),
      };
    }),
    RESERVED_PAGE_IDS,
  );

  return { fields: resolveIds(fields), pages, options };
}

/** Existing registry questions become snapshots before their definitions can change. */
export function $freezeRegistryOptions() {
  for (const node of $formBlocks()) {
    if (!$isInput(node)) continue;
    const settings = $settings(node);
    const preset = presetOf(settings, $blockKind(node));

    if (!preset) continue;

    if (typeof settings.sourceFieldId !== "string")
      $setSettings(node, { sourceFieldId: preset.fieldId, sourceLabel: preset.label });

    if (!$isOptionNode(node) || typeof settings.sourceOptionValue === "string") continue;

    const value =
      preset.optionValues?.[node.getTextContent()] ??
      autoId(node.getTextContent(), "option", "option-");

    $setSettings(node, { sourceOptionValue: value });
  }
}

import { legacyFieldAdapter } from "./legacy-mappings";
