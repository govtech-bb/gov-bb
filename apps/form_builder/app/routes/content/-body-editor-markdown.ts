import {
  serializeLandingComponent,
  unescapeDirectiveAttribute,
  type LandingAction,
} from "@govtech-bb/content/markdown-authoring";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  isTableRowDivider,
  TRANSFORMERS,
  type ElementTransformer,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/extension";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  type ElementNode,
} from "lexical";
import {
  $createLandingComponentNode,
  $createRawBreakNode,
  $createStartLinkNode,
  $isLandingComponentNode,
  $isStartLinkNode,
  LandingComponentNode,
  RawBreakNode,
  StartLinkNode,
} from "./-body-editor-nodes";

const DIRECTIVE_END = /^:::\s*$/;
const NOTICE_START = /^:::notice\s*$/i;
const ACTIONS_START = /^:::actions\s*$/i;
const DETAILS_START = /^:::details\{\s*summary="((?:\\.|[^"\\])*)"\s*\}\s*$/i;
const ACTION_LINE = /^::action\[((?:\\.|[^\]\\])*)\]\{\s*([^}]*)\}\s*$/i;
const ATTRIBUTE = /([a-z][\w-]*)="((?:\\.|[^"\\])*)"/gi;

function appendComponent(
  rootNode: ElementNode,
  component: Parameters<typeof $createLandingComponentNode>[0],
): void {
  rootNode.append($createLandingComponentNode(component));
}

const NOTICE: MultilineElementTransformer = {
  dependencies: [LandingComponentNode],
  export: (node) =>
    $isLandingComponentNode(node) && node.getComponent().kind === "notice"
      ? serializeLandingComponent(node.getComponent())
      : null,
  regExpStart: NOTICE_START,
  regExpEnd: DIRECTIVE_END,
  replace: (rootNode, children, _startMatch, _endMatch, linesInBetween) => {
    const body =
      linesInBetween?.join("\n") ??
      children?.map((node) => node.getTextContent()).join("\n") ??
      "";
    appendComponent(rootNode, { kind: "notice", body: body.trim() });
  },
  type: "multiline-element",
};

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = unescapeDirectiveAttribute(match[2]);
  }
  return attributes;
}

export function parseActionDirective(line: string): LandingAction | null {
  const match = line.match(ACTION_LINE);
  if (!match) return null;
  const attributes = parseAttributes(match[2]);
  if (!attributes.href) return null;
  return {
    label: match[1].replace(/\\([\\\]])/g, "$1"),
    href: attributes.href,
    variant: attributes.variant === "secondary" ? "secondary" : "primary",
  };
}

const ACTIONS: MultilineElementTransformer = {
  dependencies: [LandingComponentNode],
  export: (node) =>
    $isLandingComponentNode(node) && node.getComponent().kind === "actions"
      ? serializeLandingComponent(node.getComponent())
      : null,
  regExpStart: ACTIONS_START,
  regExpEnd: DIRECTIVE_END,
  replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
    const actions = (linesInBetween ?? [])
      .map(parseActionDirective)
      .filter((action): action is LandingAction => action !== null);
    appendComponent(rootNode, {
      kind: "actions",
      actions:
        actions.length > 0
          ? actions
          : [{ label: "Continue", href: "/", variant: "primary" }],
    });
  },
  type: "multiline-element",
};

const DETAILS: MultilineElementTransformer = {
  dependencies: [LandingComponentNode],
  export: (node) =>
    $isLandingComponentNode(node) && node.getComponent().kind === "details"
      ? serializeLandingComponent(node.getComponent())
      : null,
  regExpStart: DETAILS_START,
  regExpEnd: DIRECTIVE_END,
  replace: (rootNode, children, startMatch, _endMatch, linesInBetween) => {
    const body =
      linesInBetween?.join("\n") ??
      children?.map((node) => node.getTextContent()).join("\n") ??
      "";
    appendComponent(rootNode, {
      kind: "details",
      summary: unescapeDirectiveAttribute(startMatch[1] || "More information"),
      body: body.trim(),
    });
  },
  type: "multiline-element",
};

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const START_LINK: ElementTransformer = {
  dependencies: [StartLinkNode],
  export: (node) => {
    if (!$isStartLinkNode(node)) return null;
    const { label, href } = node.getValues();
    return `<a data-start-link${href ? ` href="${escapeHtml(href)}"` : ""}>${escapeHtml(label)}</a>`;
  },
  regExp: /^<a\s+([^>]*\bdata-start-link\b[^>]*)>(.*?)<\/a>\s*$/i,
  replace: (parentNode, _children, match) => {
    const href = match[1].match(/\bhref=(?:"([^"]*)"|'([^']*)')/i);
    parentNode.replace(
      $createStartLinkNode(
        decodeHtmlAttribute(match[2] || "Start now"),
        decodeHtmlAttribute(href?.[1] ?? href?.[2] ?? ""),
      ),
    );
  },
  type: "element",
};

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(?:---|\*\*\*|___)\s*$/,
  replace: (parentNode) => {
    parentNode.replace($createHorizontalRuleNode());
  },
  triggerOnEnter: true,
  type: "element",
};

function splitTableRow(line: string): string[] {
  const source = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let value = "";
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      value += character;
    } else if (character === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells.map((cell) => cell.replace(/\\\|/g, "|"));
}

function appendTable(lines: string[], rootNode: ElementNode): void {
  const rows = lines.map(splitTableRow);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const table = $createTableNodeWithDimensions(rows.length, columnCount, {
    rows: true,
    columns: false,
  });

  table.getChildren().forEach((rowNode, rowIndex) => {
    if (!$isTableRowNode(rowNode)) return;
    rowNode.getChildren().forEach((cellNode, columnIndex) => {
      if (!$isTableCellNode(cellNode)) return;
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(rows[rowIndex]?.[columnIndex] ?? ""));
      cellNode.clear().append(paragraph);
    });
  });
  rootNode.append(table);
}

function tableCellText(cell: TableCellNode): string {
  return cell
    .getTextContent()
    .replaceAll("\n", "<br />")
    .replaceAll("|", "\\|")
    .trim();
}

function exportTable(node: TableNode): string {
  const rows = node
    .getChildren()
    .filter($isTableRowNode)
    .map((row) =>
      row.getChildren().filter($isTableCellNode).map(tableCellText),
    );
  if (rows.length === 0) return "";
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => [
    ...row,
    ...Array<string>(Math.max(0, columnCount - row.length)).fill(""),
  ]);
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    row(normalized[0]),
    row(Array<string>(columnCount).fill("---")),
    ...normalized.slice(1).map(row),
  ].join("\n");
}

const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node) => ($isTableNode(node) ? exportTable(node) : null),
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    if (!isTableRowDivider(lines[startLineIndex + 1] ?? "")) return null;
    const tableLines = [lines[startLineIndex]];
    let lineIndex = startLineIndex + 2;
    while (/^\s*\|.*\|\s*$/.test(lines[lineIndex] ?? "")) {
      tableLines.push(lines[lineIndex]);
      lineIndex += 1;
    }
    appendTable(tableLines, rootNode);
    return [true, lineIndex - 1];
  },
  regExpStart: /^\s*\|.*\|\s*$/,
  replace: () => false,
  type: "multiline-element",
};

const RAW_BREAK: TextMatchTransformer = {
  dependencies: [RawBreakNode],
  importRegExp: /<br\s*\/?>/i,
  regExp: /<br\s*\/?>$/i,
  replace: (node) => {
    node.replace($createRawBreakNode());
  },
  type: "text-match",
};

export const EDITOR_TRANSFORMERS: Transformer[] = [
  NOTICE,
  ACTIONS,
  DETAILS,
  TABLE,
  START_LINK,
  HORIZONTAL_RULE,
  RAW_BREAK,
  ...TRANSFORMERS,
];

export function $loadMarkdown(markdown: string): void {
  $convertFromMarkdownString(
    markdown,
    EDITOR_TRANSFORMERS,
    undefined,
    false,
    false,
  );
}

export function $exportMarkdown(): string {
  return $convertToMarkdownString(EDITOR_TRANSFORMERS, undefined, false).trim();
}
