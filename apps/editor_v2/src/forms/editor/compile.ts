import { $isLinkNode } from "@lexical/link";
import type { LexicalEditor } from "lexical";
import {
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type EditorState,
  type ElementNode,
  type LexicalNode,
  type NodeKey,
  type TextFormatType,
} from "lexical";
import { UnavailableSsbOutput } from "../adapters/ssb/diagnostics";
import type {
  FormBlock,
  FormPage,
  FormQuestion,
  LegacySsbFormSchema as FormSchema,
} from "../adapters/ssb/schema";
import type { FormEditorDefinition } from "../definition";
import { readFormState } from "./context";
import { finalizeLegacySsb } from "../adapters/ssb/finalize";

export { preflight } from "../adapters/ssb/validation";

import { $installedContent, $installedField } from "./field-context";
import { $nestingOf, $nestPaths, $sectionKind, $statementLines } from "./nesting";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $formBlocks,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isPageHead,
  $isQuestionNode,
  $listRun,
  $pageDescription,
  $pageTitle,
  $pageType,
  $questionKey,
  $settings,
} from "./nodes";
import { refOf } from "./preset-settings";
import { $ssbIds, messagesFor } from "./ssb";
import { $formSettings } from "./form-metadata";
import { $isMentionNode, $mentionDefault, $mentionField } from "../features/mentions/node";
import { $pageBehaviours, $questionBehaviours } from "../features/repetition/queries";

export type {
  FormBlock,
  FormCalculatedFields,
  FormCallout,
  FormList,
  FormLogic,
  FormOption,
  FormPage,
  FormQuestion,
  LegacySsbFormSchema as FormSchema,
  FormSection,
  FormText,
  FormWidget,
  Nested,
} from "../adapters/ssb/schema";

export type {
  Action,
  ActionType,
  CalculateOperator,
  Comparison,
  Condition,
  LogicalOperator,
  LogicValue,
} from "../core/logic";

// Derived SSB projection. Markdown saves the raw authoring model separately, before this cleanup.
// Rich text travels as inline Markdown.

// An option's own settings, not its question's
const optionKeys = new Set(["other", "hidden", "disabled", "optionValue", "sourceOptionValue"]);

// Unsupported legacy settings may remain in saved drafts but must not reach export.
const removedSettings = new Set([
  "randomize",
  "lockInPlace",
  "allowMultiple",
  "format",
  "prefix",
  "suffix",
  "decimalSeparator",
  "thousandsSeparator",
  "internationalFormat",
  "defaultCountryCode",
  "disableDays",
  "startWeekOn",
  "specificDates",
]);

/** The form as respondents get it. */
export function compileForm(
  state: EditorState,
  definition: FormEditorDefinition,
  editor?: LexicalEditor,
): FormSchema {
  return readFormState(
    state,
    definition,
    () => {
      const [title, ...blocks] = $formBlocks();
      const ids = $ssbIds();

      // The first page's button label lives on the form title; later pages use their page break.
      const label = (node: LexicalNode | undefined) => {
        const button = node && $settings(node).button;

        return typeof button === "string" && button.trim() ? button : undefined;
      };

      const pages: FormPage[] = [
        {
          id: "start",
          stepId: title ? ids.pages.get(title.getKey())!.id : "page-1",
          pageType: "questions",
          button: label(title),
          confirmation: false,
          blocks: [],
        },
      ];

      const paths = $nestPaths();
      const done = new Set<NodeKey>();

      for (const block of blocks) {
        if (done.has(block.getKey())) continue;

        if ($isPageHead(block)) continue;

        if ($isPageBreak(block)) {
          const { name } = $settings(block);
          const pageType = $pageType(block);
          pages.push({
            id: $blockId(block),
            stepId: ids.pages.get(block.getKey())!.id,
            pageType,
            name:
              pageType === "check-answers"
                ? "Check your answers"
                : pageType === "declaration"
                  ? "Declaration"
                  : typeof name === "string"
                    ? name
                    : undefined,
            button: label(block),
            confirmation: pageType === "confirmation",
            blocks: [],
          });
          continue;
        }

        const { entry, covers } = $entry(block, ids);

        for (const node of covers) done.add(node.getKey());
        pages.at(-1)!.blocks.push({ ...entry, ...$nestingOf(block, paths, ids) });
      }

      // SSB's step behaviours (repeat.ts): page 1's repeat is on the form title, the others' on their page breaks
      const starts = [title, ...blocks.filter($isPageBreak)];
      pages.forEach((page, i) => {
        const behaviours = starts[i] && $pageBehaviours(starts[i]);

        if (behaviours) page.behaviours = behaviours;
      });
      // Titles and descriptions belong to pages, never their content blocks.
      pages.forEach((page, i) => {
        const start = starts[i];

        if (!start) return;
        page.title = $pageTitle(start);
        const description = $pageDescription(start);

        if (description) page.description = description;
      });

      return finalizeLegacySsb(
        pages,
        $formSettings(),
        title?.getTextContent().trim() ?? "",
        $isElementNode(title) ? $toMarkdown(title) : "",
      );
    },
    editor,
  );
}

function $entry(block: LexicalNode, ids: ReturnType<typeof $ssbIds>) {
  const group = $blockGroup(block);

  if (group.some($isInput)) {
    const entry = $question(group, ids);
    const lines = $statementLines(group);

    if (lines.length)
      entry.options[0]!.label +=
        "\n\n" +
        lines
          .map(
            (line, i) => `${line.getType() === "number" ? `${i + 1}.` : "-"} ${$toMarkdown(line)}`,
          )
          .join("\n");

    return { entry, covers: [...group, ...lines] };
  }

  return $content(block, ids);
}

function $question(group: LexicalNode[], ids: ReturnType<typeof $ssbIds>): FormQuestion {
  const title = group.find($isQuestionNode);
  const answers = group.filter($isInput);
  const first = answers[0]!;
  const kind = $blockKind(first);
  const behaviours = $questionBehaviours(first);

  let settings = Object.fromEntries(
    Object.entries($settings(first)).filter(
      ([key]) =>
        !optionKeys.has(key) &&
        !removedSettings.has(key) &&
        ![
          "sourceKey",
          "sourceExplicit",
          "logicVersion",
          "sourceFieldId",
          "sourceLabel",
          "sourcePreset",
        ].includes(key) &&
        key !== "conditionalLabel",
    ),
  );

  const field = $installedField(kind);
  const adapter = legacyFieldAdapter(field);

  if (!adapter)
    throw new UnavailableSsbOutput([
      {
        code: "unsupported-field-output",
        where: $questionKey(first),
        message: `${field?.label ?? "This field"} has no SSB compatibility mapping`,
      },
    ]);
  const grouped = adapter.project?.(settings);
  settings = adapter.settings(settings);

  if (field?.capabilities.hideLabel === false || !title) delete settings.hideLabel;

  return {
    type: "question",
    id: $questionKey(first),
    fieldId: ids.fields.get($questionKey(first))!.id,
    ref:
      ids.fields.get($questionKey(first))!.id === "declaration-confirmed"
        ? "components/confirmation"
        : refOf(kind, $settings(first)),
    kind,
    title: title ? $toMarkdown(title) : "",
    titleId: title ? $blockId(title) : undefined,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The explicit legacy SSB adapter retains grouped description content; its compatibility preflight owns the narrower output validation.
    description: group.flatMap((block) =>
      block !== title && !$isInput(block) ? [$block(block)] : [],
    ) as FormQuestion["description"],
    // Only select fields have a prompt, kept in their menu settings; input boxes have no placeholder.
    placeholder: adapter.placeholder?.(settings) ?? "",
    ...(grouped && { groups: grouped.groups }),
    options:
      grouped?.options ??
      answers.flatMap((option) => {
        if (!$isOptionNode(option)) return [];
        const own = $settings(option);

        return [
          {
            id: $blockId(option),
            label: option.getTextContent(),
            value: ids.options.get(option.getKey())!.id,
            other: own.other === true || undefined,
            disabled: own.disabled === true || undefined,
            hidden: own.hidden === true || undefined,
          },
        ];
      }),
    settings,
    errors: Object.fromEntries(
      messagesFor(
        kind,
        settings,
        answers.filter($isOptionNode).length,
        title?.getTextContent() ?? "",
      ).map(({ rule, message }) => [rule, message]),
    ),
    ...(behaviours && { behaviours }),
    hidden: (!$isOptionNode(first) && $settings(first).hidden === true) || undefined,
    titleHidden: (title && $settings(title).hidden === true) || undefined,
  };
}

function $content(
  node: LexicalNode,
  ids = $ssbIds(),
): { entry: Exclude<FormBlock, FormQuestion>; covers: LexicalNode[] } {
  const content = $installedContent(node);
  const id = $blockId(node);
  const adapter = legacyContentAdapter(content);

  if (!adapter)
    throw new UnavailableSsbOutput([
      {
        code: "unsupported-content-output",
        where: id,
        message: `${content?.label ?? "This block"} has no SSB compatibility mapping`,
      },
    ]);

  return adapter(node, {
    id,
    fieldId: ids.fields.get(id)?.id,
    hidden: $settings(node).hidden === true || undefined,
    settings: $settings(node),
    markdown: $isElementNode(node) ? $toMarkdown(node) : "",
    $markdown: (block) => ($isElementNode(block) ? $toMarkdown(block) : ""),
    $id: $blockId,
    $settings,
    $listRun: (block) => ($isListLine(block) ? $listRun(block) : [block]),
    $sectionKind: (block) => $sectionKind(block),
  });
}

function $block(node: LexicalNode): Exclude<FormBlock, FormQuestion> {
  return $content(node).entry;
}

// Inline Markdown for the formats Markdown has (underline and text colors have none, so they drop)
const marks: [TextFormatType, string][] = [
  ["bold", "**"],
  ["italic", "*"],
  ["strikethrough", "~~"],
];

// "{" too, so typed braces never read as a mention token
export const escape = (text: string) => text.replace(/[\\`*_~[\]!<&{]/g, "\\$&");

/** A mention in Markdown: `{{field key}}`, or `{{key|default}}` with its default value URI-encoded. */
export const mentionToken = (key: string, fallback = "") =>
  `{{${key}${fallback ? `|${encodeURIComponent(fallback)}` : ""}}}`;

/** A block's text as inline Markdown. */
export function $toMarkdown(block: ElementNode): string {
  return block
    .getChildren()
    .map((node) => {
      if ($isLineBreakNode(node)) return "\\\n";

      // Percent-encoded where it would end or break the link's destination
      if ($isLinkNode(node))
        return `[${$toMarkdown(node)}](${node.getURL().replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)})`;
      const text = node.getTextContent();

      if (!$isTextNode(node) || !text.trim()) return escape(text);
      // Markers hug the text: Markdown ignores "** bold**"
      const [, lead = "", core = "", trail = ""] = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;

      let md = $isMentionNode(node)
        ? mentionToken($mentionField(node), $mentionDefault(node))
        : node.hasFormat("code")
          ? `\`${core}\``
          : escape(core);

      for (const [format, mark] of marks) if (node.hasFormat(format)) md = mark + md + mark;

      return lead + md + trail;
    })
    .join("");
}

import { legacyFieldAdapter, legacyContentAdapter } from "./legacy-mappings";
