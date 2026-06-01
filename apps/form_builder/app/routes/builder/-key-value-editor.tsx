import { useState } from "react";
import styles from "../../styles/builder.module.css";

type Row = { key: string; value: string };

interface KeyValueEditorProps {
  value: Record<string, string | number>;
  // Emits string values: webhook headers require strings, and the
  // spreadsheet/opencrvs `string | number` records accept strings too. Keeping
  // a single string representation avoids "0" vs 0 ambiguity in the editor.
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
}

function assemble(rows: Row[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) record[key] = row.value; // blank keys contribute nothing
  }
  return record;
}

/**
 * Add/remove string→string rows for the free-form `Record` configs
 * (spreadsheet, opencrvs) and webhook `headers`. Rows are local state seeded
 * once from `value`; the consumer remounts (cards keyed by processor id) when
 * switching to a different processor, so stale rows never leak across cards.
 *
 * INVARIANT: `value` is treated as initial-only — later prop changes do NOT
 * resync the rows. That is safe only because this editor is the sole writer of
 * its config while mounted. Any future code that mutates a processor's config
 * out-of-band (reset, undo, programmatic patch) must force a remount (change
 * the React key) or this component will show stale rows.
 */
export function KeyValueEditor({
  value,
  onChange,
  addLabel = "Add row",
}: KeyValueEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([key, v]) => ({ key, value: String(v) })),
  );

  function update(nextRows: Row[]) {
    setRows(nextRows);
    onChange(assemble(nextRows));
  }

  return (
    <div className={styles.keyValueEditor}>
      {rows.map((row, i) => (
        <div key={i} className={styles.keyValueRow}>
          <input
            type="text"
            placeholder="Key"
            value={row.key}
            onChange={(e) =>
              update(
                rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
              )
            }
          />
          <input
            type="text"
            placeholder="Value"
            value={row.value}
            onChange={(e) =>
              update(
                rows.map((r, j) =>
                  j === i ? { ...r, value: e.target.value } : r,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label="Remove row"
            title="Remove row"
            onClick={() => update(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { key: "", value: "" }])}
      >
        {addLabel}
      </button>
    </div>
  );
}
