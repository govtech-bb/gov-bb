import { useState } from "react";
import type { ResolvedFieldId } from "@govtech-bb/form-builder";
import { ValuePathPicker } from "./-value-path-picker";
import {
  compileAmount,
  parseAmount,
  type AmountOperator,
  type ConditionalAmount,
} from "./-amount-rule";
import styles from "../../styles/builder.module.css";

interface AmountEditorProps {
  /** The processor config's current `amount` (number | jsonLogic | undefined). */
  amount: unknown;
  fields: ResolvedFieldId[];
  /** Namespaces input ids so labels associate correctly across cards/rows. */
  idPrefix: string;
  /** Emits the full replacement `amount` value (number, if-chain, or undefined). */
  onChange: (amount: number | Record<string, unknown> | undefined) => void;
}

const OPERATOR_LABELS: Record<AmountOperator, string> = {
  equal: "is",
  notEqual: "is not",
};

// Empty input → 0: the default and each rule amount are mandatory numbers, so
// the compiled if-chain always terminates in a real number and resolution can
// never fail to produce one.
function toAmount(raw: string): number {
  return raw === "" ? 0 : Number(raw);
}

export function AmountEditor({
  amount,
  fields,
  idPrefix,
  onChange,
}: AmountEditorProps) {
  // Classify the stored value once, on mount. The mode can't be derived from
  // `amount` alone — an empty conditional table compiles to a bare default
  // number, indistinguishable from a fixed amount — so the toggle is local
  // state seeded from the initial classification.
  const [initial] = useState(() => parseAmount(amount));
  const [mode, setMode] = useState<"fixed" | "conditional">(
    initial.kind === "conditional" ? "conditional" : "fixed",
  );
  const [conditional, setConditional] = useState<ConditionalAmount>(() =>
    initial.kind === "conditional"
      ? initial.conditional
      : { rules: [], default: initial.kind === "fixed" ? initial.amount ?? 0 : 0 },
  );

  const fid = (name: string) => `${idPrefix}-${name}`;

  // A hand- or AI-authored expression we don't recognize: show it read-only so
  // the editor never clobbers it. No toggle, no editable inputs.
  if (initial.kind === "advanced") {
    return (
      <div className={styles.formGroup}>
        <div className={styles.fieldLabel}>Amount (advanced expression)</div>
        <p className={styles.toolbarHint}>
          This amount is a custom expression and can only be edited in the
          recipe JSON.
        </p>
        <pre className={styles.processorReadOnly}>
          {JSON.stringify(initial.raw, null, 2)}
        </pre>
      </div>
    );
  }

  const emit = (next: ConditionalAmount) => {
    setConditional(next);
    onChange(compileAmount(next));
  };

  const switchMode = (next: "fixed" | "conditional") => {
    setMode(next);
    // Keep the stored value consistent with the visible mode. Fixed collapses
    // to the table's default; conditional re-emits the (possibly bare-default)
    // chain — neither clobbers a value the author can see.
    if (next === "fixed") onChange(conditional.default);
    else onChange(compileAmount(conditional));
  };

  return (
    <>
      <div className={styles.formGroup}>
        <label htmlFor={fid("amountType")}>Amount type</label>
        <select
          id={fid("amountType")}
          value={mode}
          onChange={(e) => switchMode(e.target.value as "fixed" | "conditional")}
        >
          <option value="fixed">Fixed amount</option>
          <option value="conditional">Conditional amount</option>
        </select>
      </div>

      {mode === "fixed" ? (
        <div className={styles.formGroup}>
          <label htmlFor={fid("amount")}>Amount</label>
          <input
            id={fid("amount")}
            type="number"
            min={0}
            value={typeof amount === "number" ? amount : ""}
            onChange={(e) => {
              const raw = e.target.value;
              // Mirror the table's default so switching to conditional carries
              // the value the author just typed.
              setConditional((c) => ({ ...c, default: toAmount(raw) }));
              onChange(raw === "" ? undefined : Number(raw));
            }}
          />
        </div>
      ) : (
        <>
          {conditional.rules.map((rule, i) => (
            <div key={i} className={styles.formGroup}>
              <label htmlFor={fid(`ruleField-${i}`)}>Condition field</label>
              <ValuePathPicker
                id={fid(`ruleField-${i}`)}
                value={rule.field}
                fields={fields}
                onChange={(field) =>
                  emit({
                    ...conditional,
                    rules: conditional.rules.map((r, j) =>
                      j === i ? { ...r, field } : r,
                    ),
                  })
                }
              />
              <label htmlFor={fid(`ruleOp-${i}`)}>Condition operator</label>
              <select
                id={fid(`ruleOp-${i}`)}
                value={rule.operator}
                onChange={(e) =>
                  emit({
                    ...conditional,
                    rules: conditional.rules.map((r, j) =>
                      j === i
                        ? { ...r, operator: e.target.value as AmountOperator }
                        : r,
                    ),
                  })
                }
              >
                {(Object.keys(OPERATOR_LABELS) as AmountOperator[]).map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_LABELS[op]}
                  </option>
                ))}
              </select>
              <label htmlFor={fid(`ruleValue-${i}`)}>Comparison value</label>
              <input
                id={fid(`ruleValue-${i}`)}
                type="text"
                value={rule.value}
                onChange={(e) =>
                  emit({
                    ...conditional,
                    rules: conditional.rules.map((r, j) =>
                      j === i ? { ...r, value: e.target.value } : r,
                    ),
                  })
                }
              />
              <label htmlFor={fid(`ruleAmount-${i}`)}>Rule amount</label>
              <input
                id={fid(`ruleAmount-${i}`)}
                type="number"
                min={0}
                value={rule.amount}
                onChange={(e) =>
                  emit({
                    ...conditional,
                    rules: conditional.rules.map((r, j) =>
                      j === i ? { ...r, amount: toAmount(e.target.value) } : r,
                    ),
                  })
                }
              />
              <button
                type="button"
                className={styles.btnErase}
                onClick={() =>
                  emit({
                    ...conditional,
                    rules: conditional.rules.filter((_, j) => j !== i),
                  })
                }
              >
                Remove rule
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              emit({
                ...conditional,
                rules: [
                  ...conditional.rules,
                  { field: "", operator: "equal", value: "", amount: 0 },
                ],
              })
            }
          >
            Add rule
          </button>
          <div className={styles.formGroup}>
            <label htmlFor={fid("otherwise")}>Otherwise charge</label>
            <input
              id={fid("otherwise")}
              type="number"
              min={0}
              value={conditional.default}
              onChange={(e) =>
                emit({ ...conditional, default: toAmount(e.target.value) })
              }
            />
          </div>
        </>
      )}
    </>
  );
}
