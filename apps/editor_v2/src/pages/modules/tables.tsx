import { Table } from "@phosphor-icons/react";
import {
  $createTableNodeWithDimensions,
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  TableCellHeaderStates,
  TableExtension,
} from "@lexical/table";
import { $createParagraphNode, $isParagraphNode, configExtension } from "lexical";
import type { TableRow, TableCell, AlignType } from "mdast";
import type { PageModule, PageHandler } from "../definition";
import { pageInsertAction } from "../insertion";
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
  render(node, context, key) {
    if (node.type !== "table") throw new UnsupportedPageContent(node);

    return (
      <div className="page-table-scroll" key={key}>
        <table>
          <thead>
            <tr>
              {node.children[0]?.children.map((cell, index) => (
                <th
                  key={`${key}/head/${index}`}
                  scope="col"
                  style={{ textAlign: node.align?.[index] ?? undefined }}
                >
                  {cell.children.map((child, childIndex) =>
                    context.render(child, `${key}/head/${index}/${childIndex}`),
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.children.slice(1).map((row, rowIndex) => (
              <tr key={`${key}/${rowIndex}`}>
                {row.children.map((cell, index) => (
                  <td
                    key={`${key}/${rowIndex}/${index}`}
                    style={{ textAlign: node.align?.[index] ?? undefined }}
                  >
                    {cell.children.map((child, childIndex) =>
                      context.render(child, `${key}/${rowIndex}/${index}/${childIndex}`),
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
};

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
