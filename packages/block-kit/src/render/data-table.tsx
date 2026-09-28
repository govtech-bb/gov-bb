import type { DataTableBlock } from "../types";
import type { RenderContext } from "./spans";

/**
 * Not used by any of the three seeded pages. It is built anyway: it is the
 * control case proving the config-block pattern generalises rather than
 * being three bespoke forms wearing a trench coat.
 */
export function DataTable({
  block,
  ctx,
}: {
  block: DataTableBlock;
  ctx: RenderContext;
}) {
  const ref = ctx.refs[block.source];
  const rows =
    ref && (ref.kind === "query" || ref.kind === "record")
      ? (ctx.data[ref.collection] ?? [])
      : [];

  const limited =
    ref && ref.kind === "query" && ref.limit ? rows.slice(0, ref.limit) : rows;

  if (limited.length === 0) {
    return (
      <p className="bk-empty">
        {ctx.loading ? "Loading…" : block.empty_message}
      </p>
    );
  }

  return (
    <table className="bk-table">
      <thead>
        <tr>
          {block.columns.map((column) => (
            <th key={column.field} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {limited.map((row, index) => (
          <tr key={index}>
            {block.columns.map((column) => (
              <td key={column.field}>{String(row[column.field] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
