import { Table } from "@phosphor-icons/react";
import {
  $createTableNodeWithDimensions,
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  $isTableSelection,
  $getNodeTriplet,
  $insertTableColumnAtSelection,
  $deleteTableColumnAtSelection,
  TableNode,
  TableRowNode,
  TableCellNode,
  TableCellHeaderStates,
  TableExtension,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  configExtension,
} from "lexical";
import type { TableRow, TableCell, AlignType } from "mdast";
import type { PageModule, PageHandler } from "../definition";
import { pageInsertAction } from "../insertion";
import { PageComponentNode } from "../nodes";
import { phrasing, UnsupportedPageContent } from "../markdown";

const tables: PageHandler = {
  accepts: (node) => node.type === "table" || node.type === "tableRow" || node.type === "tableCell",
  owns: (node) => $isTableNode(node) || $isTableRowNode(node) || $isTableCellNode(node),
  $import(node, context) {
    if (node.type === "table") {
      const table = $createTableNode();
      node.children.forEach((row, rowIndex) => {
        const lexicalRow = $createTableRowNode();
        row.children.forEach((cell, columnIndex) => {
          const lexicalCell = $createTableCellNode(
            rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS,
          );

          const alignment = node.align?.[columnIndex];

          if (alignment) lexicalCell.setFormat(alignment);
          lexicalCell.append(
            $createParagraphNode().append(
              ...cell.children.flatMap((child) => context.$import(child)),
            ),
          );
          lexicalRow.append(lexicalCell);
        });
        table.append(lexicalRow);
      });

      return [table];
    }

    throw new UnsupportedPageContent(node);
  },
  $export(node, context) {
    if ($isTableNode(node)) {
      const rows = node.getChildren().flatMap((row) => context.$export(row));

      if (rows.some((row) => row.type !== "tableRow")) throw new Error("Expected table rows");
      const first = node.getFirstChild();

      const align: AlignType[] = $isTableRowNode(first)
        ? first.getChildren().map((cell) => {
            if (!$isTableCellNode(cell)) throw new Error("Expected table cells");
            const format = cell.getFormatType();

            return format === "left" || format === "center" || format === "right" ? format : null;
          })
        : [];

      // SAFETY: Each exported child was checked as a table row above.
      return [{ type: "table", align, children: rows as TableRow[] }];
    }

    if ($isTableRowNode(node)) {
      const cells = node.getChildren().flatMap((cell) => context.$export(cell));

      if (cells.some((cell) => cell.type !== "tableCell")) throw new Error("Expected table cells");

      // SAFETY: Each exported child was checked as a table cell above.
      return [{ type: "tableRow", children: cells as TableCell[] }];
    }

    if ($isTableCellNode(node)) {
      const children = node.getChildren().flatMap((child, index) => {
        const content = $isParagraphNode(child)
          ? child.getChildren().flatMap((text) => context.$export(text))
          : context.$export(child);

        return index ? [{ type: "html" as const, value: "<br>" }, ...content] : content;
      });

      return [{ type: "tableCell", children: phrasing(children) }];
    }

    throw new Error("Unsupported table node");
  },
};

/** Keeps numeric column metadata attached to surviving header cells when columns change. */
export function $changePageTableColumns(operation: "insert" | "delete"): void {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) && !$isTableSelection(selection)) return;
  const [, , table] = $getNodeTriplet(selection.anchor);
  const parent = table.getParent();

  const component =
    parent instanceof PageComponentNode && parent.getKind() === "table" ? parent : null;

  const attributes = component?.getAttributes();
  const columns = table.getFirstChildOrThrow<TableRowNode>().getChildren();

  const numericKeys = new Set(
    columns
      .filter((_, index) => attributes?.numericColumns?.includes(index))
      .map((cell) => cell.getKey()),
  );

  if (operation === "insert") $insertTableColumnAtSelection(true);
  else $deleteTableColumnAtSelection();

  if (component && table.isAttached() && attributes?.numericColumns) {
    component.setAttributes({
      ...attributes,
      numericColumns: table
        .getFirstChildOrThrow<TableRowNode>()
        .getChildren()
        .flatMap((cell, index) => (numericKeys.has(cell.getKey()) ? [index] : [])),
    });
  }
}

export function PageTablesModule(): PageModule {
  return {
    key: "page-tables",
    requires: ["text"],
    nodes: [
      { type: "table", node: TableNode },
      { type: "tablerow", node: TableRowNode },
      { type: "tablecell", node: TableCellNode },
    ],
    browserExtensions: [
      configExtension(TableExtension, {
        hasCellMerge: false,
        hasCellBackgroundColor: false,
        hasHorizontalScroll: true,
        hasNestedTables: false,
      }),
    ],
    markdown: [tables],
    actions: [
      pageInsertAction(
        "page-table",
        "Table",
        () => $createTableNodeWithDimensions(3, 2, { rows: true, columns: false }),
        {
          group: "Layout",
          order: 30,
          icon: <Table />,
          description: "Compare information in rows and columns.",
          aliases: ["grid", "rows", "columns"],
        },
      ),
    ],
    theme: {
      table: "page-table",
      tableCell: "page-table-cell",
      tableCellHeader: "page-table-header",
      tableSelection: "page-table-selection",
      tableCellSelected: "page-table-cell-selected",
      tableScrollableWrapper: "page-table-scroll",
    },
  };
}
