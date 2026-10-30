import type { Element, Root } from "hast";

/**
 * Captioned tables use authored header and numeric-column metadata.
 * Uncaptioned tables retain their existing first-column headers and stacked layout.
 *
 * The legacy GOV.BB table pattern (Figma "Table/component") treats a row's first cell
 * as its header: pale-blue fill, semibold, white separator. The design system
 * paints that from `tbody th`, but GFM emits every body cell as a plain `<td>`,
 * so a markdown table would render without it. Promote the first cell of each
 * body row to `<th scope="row">`, and mark the header row's cells `scope="col"`.
 *
 * The row header is also the accessible one: a screen reader announces it with
 * each cell in the row, so "55" is read as belonging to "Before 15 July 1985".
 */
function rehypeTableScopes() {
  return (tree: Root) => visit(tree);
}

function visit(node: Root | Element): void {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "table") applyScopes(child);
    else visit(child);
  }
}

function applyScopes(table: Element): void {
  if (typeof table.properties.dataCaption === "string") {
    const numeric = String(table.properties.dataNumericColumns ?? "").split(
      ",",
    );
    for (const section of table.children) {
      if (section.type !== "element") continue;
      for (const row of section.children) {
        if (row.type !== "element" || row.tagName !== "tr") continue;
        const cells = row.children.filter(
          (cell): cell is Element => cell.type === "element",
        );
        cells.forEach((cell, index) => {
          const header =
            section.tagName === "thead" ||
            (index === 0 && table.properties.dataRowHeaders === "first");
          cell.tagName = header ? "th" : "td";
          if (header)
            cell.properties.scope = section.tagName === "thead" ? "col" : "row";
          cell.properties.dataNumeric = numeric.includes(String(index));
        });
      }
    }
    return;
  }
  // Column header text, so each body cell can carry it as `data-label` — the
  // label a stacked row shows on phones, where the header row is hidden.
  let labels: string[] = [];
  for (const section of table.children) {
    if (section.type !== "element") continue;
    const isHead = section.tagName === "thead";
    if (!isHead && section.tagName !== "tbody") continue;

    for (const row of section.children) {
      if (row.type !== "element" || row.tagName !== "tr") continue;
      const cells = row.children.filter(
        (cell): cell is Element => cell.type === "element",
      );
      if (isHead) {
        for (const cell of cells) {
          cell.properties = { ...cell.properties, scope: "col" };
        }
        labels = cells.map(textOf);
        continue;
      }
      const [first, ...rest] = cells;
      if (!first) continue;
      first.tagName = "th";
      first.properties = { ...first.properties, scope: "row" };
      rest.forEach((cell, i) => {
        const label = labels[i + 1];
        if (label) cell.properties = { ...cell.properties, dataLabel: label };
      });
    }
  }
}

function textOf(node: Element): string {
  return node.children
    .map((child) =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? textOf(child)
          : "",
    )
    .join("")
    .trim();
}

export default rehypeTableScopes;
