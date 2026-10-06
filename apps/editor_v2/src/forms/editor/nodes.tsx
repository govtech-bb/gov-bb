import type { PageType } from "../core/pages";
import { $isHeadingNode } from "@lexical/rich-text";
import eyeSlash from "@phosphor-icons/core/assets/regular/eye-slash.svg?raw";
import smiley from "@phosphor-icons/core/assets/regular/smiley.svg?raw";
import {
  $copyNode,
  $create,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  $setState,
  ElementNode,
  type LexicalNode,
  type ParagraphNode,
  type RangeSelection,
} from "lexical";
import { cn } from "../../cn";
import { $paragraphAfter } from "../../editor/core/blocks";
import {
  $blockId,
  $depth,
  $setDepth,
  $settings,
  blockIdState,
  depthState,
  settingsState,
} from "../../editor/core/document-state";
import { $setFormSettings as $setSettings } from "./native-settings";
import { $native, $setNative } from "./native-state";
import { $isShowHideNode } from "../../editor/modules/disclosure/nodes";
import { $isListLine, $listRun } from "../../editor/modules/lists/nodes";
import {
  $static,
  $tip,
  container,
  el,
  ghost,
  icon,
  placeholder,
} from "../../editor/react/block-dom";
import type { Setting } from "../core/settings";
import { sourceFieldForNode } from "../source/field";
import { $logicMount, $optional } from "./answer-dom";
import {
  $createOptionNode,
  $createWidgetNode,
  $isOptionNode,
  $isWidgetNode,
  choiceKindState,
  inputKindState,
  InputNode,
  LongAnswerNode,
  WidgetNode,
  widgetState,
} from "./answer-nodes";
import {
  $hasConditionalLogic,
  $installedField,
  $installedFields,
  $installedContents,
} from "./field-context";

export {
  $blockId,
  $depth,
  $setDepth,
  $settings,
  blockIdState,
  depthState,
  settingsState,
} from "../../editor/core/document-state";

export { $setFormSettings as $setSettings } from "./native-settings";

export {
  $createInsetNode,
  $createWarningNode,
  $isCallout,
  InsetNode,
  WarningNode,
} from "../../editor/modules/callouts/nodes";

export {
  $createShowHideNode,
  $isShowHideNode,
  $toggleShowHide,
  ShowHideNode,
} from "../../editor/modules/disclosure/nodes";

export {
  $createBulletNode,
  $createListLine,
  $createNumberNode,
  $isListLine,
  $listRun,
  BulletNode,
  listIndexState,
  NumberNode,
} from "../../editor/modules/lists/nodes";

export { container, ghost } from "../../editor/react/block-dom";

export {
  $createInputNode,
  $createLongAnswerNode,
  $createOptionNode,
  $createWidgetNode,
  $isOptionNode,
  $isWidgetNode,
  choiceKinds,
  choiceKindState,
  inputKindState,
  InputNode,
  LongAnswerNode,
  OptionNode,
  WidgetNode,
  widgetState,
  type InputKind,
} from "./answer-nodes";

/** GovBB's service name, above each page's title. */
export const serviceLine =
  "relative pt-2 pb-6 ps-4 text-(length:--form-text) leading-[1.5] text-muted after:absolute after:top-0 after:bottom-4 after:start-0 after:w-1 after:bg-blue-20 after:content-['']";

export const pageTitleText =
  "text-40 leading-[1.2] font-semibold tracking-[-0.015em] max-md:text-32";

export const CHECK_ANSWERS_DESCRIPTION =
  "Review all the information you have provided before submitting your application.";

/** The last head block on a confirmation page shows the receipt below its editable text. */
function $receipt(withDefault: boolean) {
  const receipt = $static(
    "div",
    "cursor-default pt-4 text-(length:--form-text) leading-[1.5] select-none",
    { "data-receipt": "" },
  );

  receipt.hidden = true;

  const caption = el(
    "div",
    "flex h-6 items-center gap-1.5 text-12 leading-4 font-semibold text-muted [&>svg]:text-blue-40",
  );

  caption.innerHTML = icon(smiley, 14);
  caption.append("Preview");
  receipt.append(caption);

  if (withDefault)
    receipt.append(
      Object.assign(el("p", "pt-1 pb-2"), { textContent: "Your submission has been saved" }),
    );
  const row = el("dl", "grid grid-cols-2 gap-4 border-b border-line py-3");
  row.append(
    Object.assign(el("dt", "font-bold"), { textContent: "Submission ID" }),
    Object.assign(el("dd", "text-muted"), { textContent: "SUB-12345678" }),
  );
  receipt.append(row);

  return receipt;
}

function $hiddenLabelTag() {
  const tag = $static(
    "span",
    "group/tip relative ms-1.5 hidden items-center gap-1 align-middle text-12 leading-4 font-semibold text-muted in-data-label-hidden:inline-flex",
  );

  tag.innerHTML = icon(eyeSlash, 14);
  tag.append(
    "Hidden",
    $tip("Hidden on the page. Screen readers and Check your answers still use it", "top"),
  );

  return tag;
}

/** Any JSON value: logic rules and calculated fields keep nested lists and objects. */
export type { Setting, Settings } from "../core/settings";

/** Every block gets an id; a copy (duplicate, paste) that arrives with another's id gets its own. */
export function $ensureBlockIds(root: ElementNode) {
  const seen = new Set<string>();

  for (const node of root.getChildren()) {
    let id = $blockId(node);

    if (!id || seen.has(id)) $setState(node, blockIdState, (id = crypto.randomUUID()));
    seen.add(id);
  }
}

/** FORM_TITLE: the form name, shown as the service name above every page heading. */
export class FormTitleNode extends ElementNode {
  override $config() {
    return this.config("form-title", { extends: ElementNode });
  }
  override createDOM() {
    return el("p", `${container} ${serviceLine} ${placeholder}`, {
      "data-placeholder": "Service name",
    });
  }
  override updateDOM() {
    return false;
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    // Multiline pastes carry on after page 1's head.
    return $paragraphAfter($headEnd(this), restoreSelection);
  }
}

/** SSB titles and descriptions are plain strings, including text pasted or merged into them. */
function $plainHead(node: ElementNode) {
  if ($native($headStart(node)).page) return;

  for (const child of node.getChildren()) {
    if (child.getType() !== "text")
      child.replace(
        $createTextNode(child.getType() === "linebreak" ? " " : child.getTextContent()),
      );
    else if ($isTextNode(child) && (child.getFormat() || child.getStyle()))
      child.setFormat(0).setStyle("");
  }
}

export class PageTitleNode extends ElementNode {
  override $config() {
    return this.config("page-title", { extends: ElementNode, $transform: $plainHead });
  }
  override createDOM() {
    const dom = el("div", cn(container, "pb-6 [&:has(+[data-page-description])]:pb-4"), {
      "data-page-title": "",
    });

    const text = el(
      "h1",
      cn(
        pageTitleText,
        "relative before:pointer-events-none before:absolute before:inset-x-0 before:truncate before:text-subtle has-[>br:only-child]:before:content-[attr(data-placeholder)]",
      ),
      { "data-text": "", "data-placeholder": "Page heading" },
    );

    dom.append(
      text,
      $logicMount(),
      $receipt(true),
      $static("div", "", { "data-native-preview": "" }),
    );

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    // SAFETY: createDOM appends the data-text HTML element directly to this page head.
    return super
      .getDOMSlot(dom)
      .withElement(dom.querySelector(":scope > [data-text]") as HTMLElement);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    const next = this.getNextSibling();

    if ($isPageDescriptionNode(next)) return $setDepth($paragraphAfter(next, restoreSelection), 0);
    const description = $setDepth($createPageDescriptionNode(), 0);
    this.insertAfter(description, restoreSelection);

    return description;
  }
}

export class PageDescriptionNode extends ElementNode {
  override $config() {
    return this.config("page-description", { extends: ElementNode, $transform: $plainHead });
  }
  override createDOM() {
    const dom = el("div", cn(container, "pb-6"), { "data-page-description": "" });
    dom.append(
      el("p", cn("leading-[1.5]", placeholder), {
        "data-text": "",
        "data-placeholder": "Description: why you ask, or what happens next",
      }),
      $receipt(false),
      $static("div", "", { "data-native-preview": "" }),
    );

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    // SAFETY: createDOM appends the data-text HTML element directly to this page head.
    return super
      .getDOMSlot(dom)
      .withElement(dom.querySelector(":scope > [data-text]") as HTMLElement);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $setDepth($paragraphAfter(this, restoreSelection), 0);
  }
}

/**
 * TITLE: a question's title, GovBB's bold label. Its "(optional)" sits inside the label, after the text Lexical keeps,
 * so it follows the last word when the title wraps.
 */
export class QuestionNode extends ElementNode {
  override $config() {
    return this.config("question", { extends: ElementNode });
  }
  override createDOM() {
    // Straight onto a hint under it, as GovBB's label and hint sit
    const dom = el("div", `${container} [&:has(+[data-hint])>h2]:pb-0.5`);

    // ponytail: ch uses the title's bold face, a little wider than SSB's group measure.
    const text = el(
      "h2",
      `w-fit max-w-[var(--field-width,100%)] pt-6 pb-2 leading-[1.5] font-bold in-data-label-hidden:pt-4 in-data-label-hidden:pb-1 in-data-label-hidden:text-14 in-data-label-hidden:leading-5 in-data-label-hidden:font-semibold in-data-label-hidden:text-muted ${ghost} has-[>br:first-child]:before:content-[attr(data-placeholder)] [&>[data-optional]]:ml-1.5`,
      { "data-placeholder": "Type a question" },
    );

    text.append($optional(""), $hiddenLabelTag());
    dom.append(text, $logicMount());

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    const text = dom.querySelector("h2")!;

    return super
      .getDOMSlot(dom)
      .withElement(text)
      .withBefore(text.querySelector("[data-optional]"));
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $paragraphAfter(this, restoreSelection);
  }
}

/** Backspace at the start of a list line, callout or show/hide: back to a text line with its text, depth and Hide. */
export function $toText(block: ElementNode): ParagraphNode {
  const line = $setDepth(
    $setSettings($createParagraphNode(), { hidden: $settings(block).hidden }),
    $depth(block),
  );

  block.replace(line, true);
  line.selectStart();

  return line;
}

export const $createPageTitleNode = () => $create(PageTitleNode);

export const $createPageDescriptionNode = () => $create(PageDescriptionNode);

export const $createFormTitleNode = () => $create(FormTitleNode);

export const $createQuestionNode = () => $create(QuestionNode);

export const $isPageTitleNode = (node: LexicalNode | null | undefined): node is PageTitleNode =>
  node instanceof PageTitleNode;

export const $isPageDescriptionNode = (
  node: LexicalNode | null | undefined,
): node is PageDescriptionNode => node instanceof PageDescriptionNode;

export const $isFormTitleNode = (node: LexicalNode | null | undefined) =>
  node instanceof FormTitleNode;

export const $isQuestionNode = (node: LexicalNode | null | undefined): node is QuestionNode =>
  node instanceof QuestionNode;

/** Configured fields own their storage shape, including custom node families. */
export const $fieldForNode = (node: LexicalNode) => {
  const fields = $installedFields();

  const handler = sourceFieldForNode(
    fields.map((field) => field.source),
    node.exportJSON(),
  );

  return handler && fields.find((field) => field.kind === handler.kind);
};

export const $isInput = (node: LexicalNode | null | undefined) => !!node && !!$fieldForNode(node);

/** Blocks without rich text: plain option labels and drawn inputs with empty slots. */
export const $isPlainText = (node: LexicalNode) =>
  (!$native(node).option && $isOptionNode(node)) ||
  node instanceof InputNode ||
  node instanceof LongAnswerNode ||
  $isShowHideNode(node) ||
  ($isPageHead(node) && !$native($headStart(node)).page);

// Text that can sit inside a question, between its title and its inputs, without breaking it up
const $isInner = (node: LexicalNode) => $isParagraphNode(node) || $isHeadingNode(node);

/** Finer than getType(): the widget, heading tag, or input/choice kind. */
export function $blockKind(node: LexicalNode): string {
  const field = $fieldForNode(node);

  if (field) return field.kind;

  if ($isWidgetNode(node)) return $getState(node, widgetState);

  if ($isOptionNode(node)) return $getState(node, choiceKindState);

  if (node instanceof InputNode) return $getState(node, inputKindState);

  if ($isHeadingNode(node)) return node.getTag();

  return node.getType();
}

// Adjacent options of the same kind and depth share a question.
const $sameRun = (a: LexicalNode, b: LexicalNode | null) =>
  $isOptionNode(a) &&
  $isOptionNode(b) &&
  $getState(a, choiceKindState) === $getState(b, choiceKindState) &&
  $depth(a) === $depth(b);

/** A block's run of options (just the block when it isn't an option), in reading order. */
export function $run(block: LexicalNode) {
  let first = block;

  for (
    let prev = $levelStep(first, false);
    prev && $sameRun(first, prev);
    prev = $levelStep(first, false)
  )
    first = prev;
  const run: LexicalNode[] = [];

  for (
    let next: LexicalNode | null = first;
    next;
    next = $sameRun(next, $levelStep(next, true)) ? $levelStep(next, true) : null
  )
    run.push(next);

  return run;
}

/**
 * Group a question label, its hint text and answer blocks in reading order. Untitled inputs are their own questions;
 * ordinary text blocks stand alone. Positional grouping means text between two options splits the question.
 */
export function $blockGroup(block: LexicalNode): LexicalNode[] {
  // A page break takes its head; a folded page takes its content too.
  if ($isPageBreak(block))
    return [block, ...$pageHead(block), ...($settings(block).folded ? $pageBlocks(block) : [])];

  if (!$isQuestionNode(block) && !$isInput(block)) return [block];
  let input: LexicalNode | null = $isInput(block) ? $run(block)[0]! : null;
  let title: LexicalNode | null = input ? null : block;

  if (input) {
    let prev = $prevBlock(input);

    while (prev && $depth(prev) === $depth(input) && $isInner(prev)) prev = $prevBlock(prev);

    if ($isQuestionNode(prev) && $depth(prev) === $depth(input)) title = prev;
  }

  const group: LexicalNode[] = [];

  if (title) {
    group.push(title);
    const text: LexicalNode[] = [];
    let next = $nextBlock(title);

    for (; next && $depth(next) === $depth(title) && $isInner(next); next = $nextBlock(next))
      text.push(next);

    if (!next || !$isInput(next) || $depth(next) !== $depth(title)) return group;
    group.push(...text);
    input = next;
  }

  return input ? [...group, ...$run(input)] : group;
}

/** A question's hint (GovBB's hint text): the paragraphs between its title and its input. Null without a title. */
export function $hintBlocks(node: LexicalNode) {
  const group = $blockGroup(node);
  const title = group.find($isQuestionNode);
  const input = group.find($isInput);

  return title && input
    ? group.slice(group.indexOf(title) + 1, group.indexOf(input)).filter($isParagraphNode)
    : null;
}

/** Focus the first hint without rewriting its rich text, creating a paragraph only when needed. */
export function $editHint(node: LexicalNode) {
  const hints = $hintBlocks(node);

  if (!hints) return null;
  let hint = hints[0];

  if (!hint) {
    const title = $blockGroup(node).find($isQuestionNode)!;
    title.insertAfter((hint = $setDepth($createParagraphNode(), $depth(title))));
  }

  hint.selectEnd();

  return hint;
}

export const $addLogicAfter = (node: LexicalNode) =>
  $hasConditionalLogic()
    ? $withNested($blockGroup(node))
        .at(-1)!
        .insertAfter($setDepth($createWidgetNode("conditional-logic"), $depth(node)))
    : undefined;

/** Read shared question settings from the first answer block; other blocks keep their own settings. */
export const $settingsHolder = (node: LexicalNode) => $blockGroup(node).find($isInput) ?? node;

/**
 * Changes a question's settings; any block of the question will do. They're kept on every answer block,
 * so deleting the first option loses nothing ($shareQuestionSettings hands them to new options).
 * The "Other" option setting also adds or removes a last option labelled Other.
 */
export function $updateSettings(
  node: LexicalNode,
  patch: Partial<Record<string, Setting | undefined>>,
) {
  const answers = $blockGroup(node).filter($isInput);

  for (const block of answers.length ? answers : [node]) $setSettings(block, patch);

  if (!("hasOtherOption" in patch)) return;
  const options = $blockGroup(node).filter($isOptionNode);

  for (const option of options)
    if ($settings(option).other) for (const block of $withNested([option])) block.remove();
  const last = options.filter((option) => !$settings(option).other).at(-1);

  if (patch.hasOtherOption && last)
    $withNested([last])
      .at(-1)!
      .insertAfter(
        $setDepth(
          $setSettings(
            $createOptionNode($getState(last, choiceKindState)).append($createTextNode("Other")),
            { other: true },
          ),
          $depth(last),
        ),
      );
}

// Settings that belong to one block rather than its question
const ownKeys = new Set(["other", "hidden", "disabled", "optionValue", "sourceOptionValue"]);

const $shared = (node: LexicalNode) =>
  Object.entries($settings(node))
    .filter(([key]) => !ownKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

/** The shared field ID keeps answer, logic and mention references stable when the first option is deleted. */
export function $questionKey(answer: LexicalNode) {
  const field = $settings(answer).field;

  return typeof field === "string" ? field : $blockId(answer);
}

/**
 * Every question gets its field id: its first answer block's id, the key logic and mentions already use. A copy
 * arrives with the original's; the question whose first answer that id came from keeps it, the copy gets its own.
 * Runs after $ensureBlockIds.
 * ponytail: once the original's first option is gone, the first of the two in the form keeps the id, so a copy
 * pasted above that original takes it. Comparing against the previous editor state would settle it.
 */
export function $ensureQuestionFields(root: ElementNode) {
  const runs = $formBlocks(root)
    .filter((block) => $isInput(block) && $run(block)[0]!.is(block))
    .map($run);

  const field = (run: LexicalNode[]) => $settings(run[0]!).field;

  // Owners first, so a copy pasted above its original doesn't take the original's id
  const taken = new Set(
    runs.flatMap((run) => (field(run) === $blockId(run[0]!) ? [String(field(run))] : [])),
  );

  const kept = new Set<string>();

  for (const run of runs) {
    const current = field(run);
    const owner = typeof current === "string" && current === $blockId(run[0]!);

    if (typeof current === "string" && (owner || (!taken.has(current) && !kept.has(current)))) {
      kept.add(current);

      if (run.some((b) => $settings(b).field !== current))
        for (const b of run) $setSettings(b, { field: current });
      continue;
    }

    const next =
      taken.has($blockId(run[0]!)) || kept.has($blockId(run[0]!))
        ? crypto.randomUUID()
        : $blockId(run[0]!);

    kept.add(next);

    for (const b of run) $setSettings(b, { field: next });
  }
}

/** Options that joined a question (Enter, paste, bulk insert) take its settings from the first option that has some. */
export function $shareQuestionSettings(root: ElementNode) {
  for (const block of $formBlocks(root)) {
    if (!$isOptionNode(block) || !$run(block)[0]!.is(block)) continue;
    const run = $run(block);
    const source = run.find((option) => $shared(option).length);

    if (!source) continue;
    const shared = $shared(source);
    const native = $native(source);

    if (native.question)
      for (const option of run)
        if (!$native(option).question) {
          $setNative(option, {
            question: native.question,
            owner: native.question.id,
            part: "option",
            option: { id: crypto.randomUUID(), value: option.getTextContent() },
          });
        }

    const wanted = JSON.stringify(shared);

    for (const option of run)
      if (JSON.stringify($shared(option)) !== wanted)
        $setState(option, settingsState, (own) => ({
          ...Object.fromEntries(Object.entries(own).filter(([key]) => ownKeys.has(key))),
          ...Object.fromEntries(shared),
        }));
  }
}

export const $isPageBreak = (node: LexicalNode | null | undefined): node is WidgetNode =>
  $isWidgetNode(node) && $getState(node, widgetState) === "page-break";

export type { PageType } from "../core/pages";

export function $pageType(start: LexicalNode): PageType {
  const native = $native(start).page;

  if (native) return native.role === "review" ? "check-answers" : native.role;

  if (!$isPageBreak(start)) return "questions";
  const { pageType, confirmation } = $settings(start);

  return pageType === "check-answers" || pageType === "declaration"
    ? pageType
    : confirmation === true
      ? "confirmation"
      : "questions";
}

/** The blocks after a page start up to the next page, without its head. */
export function $pageBlocks(pageBreak: LexicalNode) {
  const blocks: LexicalNode[] = [];

  for (let next = $nextBlock(pageBreak); next && !$isPageBreak(next); next = $nextBlock(next))
    if (!$isPageHead(next)) blocks.push(next);

  return blocks;
}

export const $isPageStart = (node: LexicalNode | null | undefined) =>
  $isFormTitleNode(node) || $isPageBreak(node);

export const $isPageHead = (
  node: LexicalNode | null | undefined,
): node is PageTitleNode | PageDescriptionNode =>
  $isPageTitleNode(node) || $isPageDescriptionNode(node);

export const $takesHead = (start: LexicalNode) =>
  !!$native(start).page || ["questions", "confirmation", "result"].includes($pageType(start));

/** The title and optional description belong to the page start immediately before them. */
export function $pageHead(start: LexicalNode): (PageTitleNode | PageDescriptionNode)[] {
  if (!$isPageStart(start)) return [];
  const title = $nextBlock(start);

  if (!$isPageTitleNode(title)) return [];
  const description = $nextBlock(title);

  return $isPageDescriptionNode(description) ? [title, description] : [title];
}

export function $headStart(node: LexicalNode): LexicalNode {
  let at = node;

  while ($isPageHead(at) && $prevBlock(at)) at = $prevBlock(at)!;

  return at;
}

export const $headEnd = (node: LexicalNode): LexicalNode =>
  $pageHead($headStart(node)).at(-1) ?? node;

export function $typedPageTitle(start: LexicalNode) {
  const [title] = $pageHead(start);

  if (title) return title.getTextContent().trim();
  const { name } = $settings(start);

  return typeof name === "string" ? name.trim() : "";
}

export function $autoPageTitle(start: LexicalNode) {
  const heading = $pageBlocks(start).find(
    (block) => ($isHeadingNode(block) || $isQuestionNode(block)) && block.getTextContent().trim(),
  );

  if (heading) return heading.getTextContent().trim();

  if ($pageType(start) === "confirmation") return "Application submitted";

  return `Page ${
    $formBlocks()
      .filter((block, index) => index === 0 || $isPageBreak(block))
      .indexOf(start) + 1
  }`;
}

const fixedTitles: Partial<Record<PageType, string>> = {
  "check-answers": "Check your answers",
  declaration: "Declaration",
};

export const $pageTitle = (start: LexicalNode) =>
  ($native(start).page ? undefined : fixedTitles[$pageType(start)]) ??
  ($typedPageTitle(start) || $autoPageTitle(start));

export const $pageDescription = (start: LexicalNode) =>
  $pageType(start) === "check-answers"
    ? CHECK_ANSWERS_DESCRIPTION
    : ($pageHead(start)[1]?.getTextContent().trim() ?? "");

// Confirmation content describes the completed transaction; it cannot ask for more answers.
export const confirmationContentKinds = new Set([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "question",
  "bullet",
  "number",
]);

export const $canBeConfirmationPage = (pageBreak: LexicalNode) =>
  !["check-answers", "declaration"].includes($pageType(pageBreak)) &&
  $pageBlocks(pageBreak).every(
    (block) => !$isInput(block) && confirmationContentKinds.has($blockKind(block)),
  );

/** Folded pages, questions and expandable sections keep their contents out of caret navigation. */
export function $isFoldedAway(node: LexicalNode) {
  for (let prev = $prevBlock(node); prev; prev = $prevBlock(prev)) {
    if ($isPageBreak(prev)) return !!$settings(prev).folded;

    if (
      $isShowHideNode(prev) &&
      $settings(prev).folded &&
      $nested(prev).some((block) => block.is(node))
    )
      return true;

    if (!$isQuestionNode(prev) || !$settings(prev).folded) continue;
    const group = $blockGroup(prev);

    if (group.some($isOptionNode) && $withNested(group).some((block) => block.is(node)))
      return true;
  }

  return false;
}

/** Keep page purpose explicit; converters report incompatible content. */
export function $normalizePages(root: ElementNode) {
  for (const block of root.getChildren()) {
    if (!$isPageBreak(block)) continue;
    const { confirmation, folded } = $settings(block);

    if (confirmation && ["check-answers", "declaration"].includes($pageType(block)))
      $setSettings(block, { confirmation: undefined });

    if (folded && !$pageBlocks(block).length) $setSettings(block, { folded: false });
  }
}

// Structural blocks must remain visible.
const unhideable = new Set(["page-break", "conditional-logic", "calculated-fields"]);

export const $canHide = (node: LexicalNode) =>
  !$isFormTitleNode(node) && !unhideable.has($blockKind(node));

/** Hide/Show: a title takes its question, and a show/hide takes its content; other blocks go alone. */
export function $toggleHidden(node: LexicalNode) {
  if (!$canHide(node)) return;
  const hidden = !$settings(node).hidden;

  for (const block of $isQuestionNode(node)
    ? $blockGroup(node)
    : $isShowHideNode(node)
      ? $withNested([node])
      : [node])
    $setHidden(block, hidden);
}

/** One block's Hide/Show. */
export const $setHidden = (block: LexicalNode, hidden: boolean) =>
  void $setSettings(block, { hidden });

export const $turnIntoGroups = (): [kind: string, label: string][][] => [
  $installedFields()
    .filter((field) => field.turnInto?.group === "choice")
    .sort((a, b) => a.turnInto!.order - b.turnInto!.order)
    .map((field) => [field.kind, field.label]),
  $installedFields()
    .filter((field) => field.turnInto?.group === "written-answer")
    .sort((a, b) => a.turnInto!.order - b.turnInto!.order)
    .map((field) => [field.kind, field.label]),
  $installedContents()
    .filter((content) => content.turnInto)
    .sort((a, b) => a.turnInto!.order - b.turnInto!.order)
    .map((content) => [content.turnInto!.kind, content.label]),
];

/** Turn into: a question's options all change kind; any other block is swapped for the new type, keeping its text and settings. */
export function $turnInto(node: LexicalNode, kind: string) {
  if ($isOptionNode(node)) {
    if (!$installedField(kind)?.choice) return;

    for (const option of $blockGroup(node).filter($isOptionNode))
      $setState(option, choiceKindState, kind);

    return;
  }

  const make = $isInput(node)
    ? $installedField(kind)?.turnInto?.create
    : $installedContents().find((content) => content.turnInto?.kind === kind)?.turnInto?.create;

  if (!make || !$isElementNode(node)) return;

  for (const block of $isListLine(node) && (kind === "bullet" || kind === "number")
    ? $listRun(node)
    : [node]) {
    const next = $setState(
      $setState(make(), settingsState, $settings(block)),
      depthState,
      $getState(block, depthState),
    );

    block.replace(next, true);

    if ($isShowHideNode(next)) for (const text of next.getAllTextNodes()) text.setFormat(0);
  }
}

/** $copyNode is shallow; this copies children too. The copy gets its own id. */
export function $deepCopy<T extends LexicalNode>(node: T): T {
  const copy = $setState($copyNode(node), blockIdState, "");

  if (["fieldId", "pageId", "optionValue"].some((key) => key in $settings(copy)))
    $setSettings(copy, { fieldId: undefined, pageId: undefined, optionValue: undefined });
  const copySettings = $isInput(copy) && $installedField($blockKind(copy))?.copySettings;

  if (copySettings) $setState(copy, settingsState, copySettings($settings(copy)));

  if ($isElementNode(node) && $isElementNode(copy))
    copy.append(...node.getChildren().map($deepCopy));

  return copy;
}

/** Form blocks are the root children in reading order. */
export const $formBlocks = (root: ElementNode = $getRoot()): LexicalNode[] => root.getChildren();

/** Blocks other blocks can sit under: an option (its follow-ups) and a show/hide (its content). */
export const $isHost = (node: LexicalNode | null | undefined) =>
  $isOptionNode(node) ||
  $isShowHideNode(node) ||
  !!(node && ($native(node).content || ($native(node).question && $isInput(node))));

/** What sits under a block: the blocks right after it that are deeper. Empty unless it's a host. */
export function $nested(block: LexicalNode): LexicalNode[] {
  if (!$isHost(block)) return [];
  const nested: LexicalNode[] = [];

  for (let next = $nextBlock(block); next && $depth(next) > $depth(block); next = $nextBlock(next))
    nested.push(next);

  return nested;
}

/** Blocks with everything nested under them, once each, in reading order. */
export function $withNested(blocks: LexicalNode[]): LexicalNode[] {
  const keys = new Set(
    blocks.flatMap((block) => [block, ...$nested(block)]).map((block) => block.getKey()),
  );

  return $formBlocks().filter((block) => keys.has(block.getKey()));
}

/** The depth for blocks put right after `anchor`: its own, or one deeper between a host and its first nested block. `skip`: blocks about to move. */
export function $depthAt(anchor: LexicalNode, skip: LexicalNode[] = []): number {
  let next = $nextBlock(anchor);

  while (next && skip.some((block) => block.is(next))) next = $nextBlock(next);

  return $depth(anchor) + ($isHost(anchor) && next && $depth(next) > $depth(anchor) ? 1 : 0);
}

/** Moves blocks together: the first lands on `depth`, the rest keep their depth relative to it. */
export function $rebase(blocks: LexicalNode[], depth: number): void {
  if (!blocks.length) return;
  const shift = depth - $depth(blocks[0]!);

  for (const block of blocks) $setDepth(block, $depth(block) + shift);
}

/** The next or previous block at this level, skipping deeper blocks. */
function $levelStep(block: LexicalNode, forward: boolean): LexicalNode | null {
  let next = forward ? $nextBlock(block) : $prevBlock(block);

  while (next && $depth(next) > $depth(block)) next = forward ? $nextBlock(next) : $prevBlock(next);

  return next;
}

/** The next block in reading order. */
export const $nextBlock = (block: LexicalNode) => block.getNextSibling();

/** The previous block in reading order. */
export const $prevBlock = (block: LexicalNode) => block.getPreviousSibling();
