import { useState } from "react";
import type { ResolvedFieldId } from "@govtech-bb/form-builder";
import { ValuePathPicker } from "./-value-path-picker";
import {
  compileAmount,
  parseAmount,
  type AmountOperator,
  type AmountRule,
  type AmountSubject,
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
  lessThan: "is less than",
  lessThanOrEqual: "is at most",
  greaterThan: "is greater than",
  greaterThanOrEqual: "is at least",
};

// Operators that compare numerically. Together with an `age` subject (always a
// number of years), these decide whether a rule's comparison value is a number
// or free text — so we don't store "national" against a `>=` or a string "16"
// against an age band (string ordering would mis-sort multi-digit numbers).
const ORDERING_OPERATORS: AmountOperator[] = [
  "lessThan",
  "lessThanOrEqual",
  "greaterThan",
  "greaterThanOrEqual",
];

function wantsNumber(subject: AmountSubject, operator: AmountOperator): boolean {
  return subject.kind === "age" || ORDERING_OPERATORS.includes(operator);
}

// Whether a field is a date-of-birth field — its label or id mentions "birth"
// (e.g. the registry's `date-of-birth` / "Date of birth", #959) or the common
// "dob" abbreviation. An age comparison only makes sense against a DOB; any
// other field yields NaN at runtime (packages/expressions age op). `ref` isn't
// carried on ResolvedFieldId, so we match on label/id like the payment picker.
function isDobField(field: ResolvedFieldId): boolean {
  const hay = `${field.fieldId} ${field.display}`.toLowerCase();
  return hay.includes("birth") || hay.includes("dob");
}

// Empty input → 0: the default and each rule amount are mandatory numbers, so
// the compiled if-chain always terminates in a real number and resolution can
// never fail to produce one.
function toNumber(raw: string): number {
  return raw === "" ? 0 : Number(raw);
}

// Keep a rule's comparison value in the type its subject/operator imply, so a
// subject or operator change never leaves a stale string under a numeric
// comparison (or vice versa).
function coerceValue(value: string | number, numeric: boolean): string | number {
  if (numeric) return typeof value === "number" ? value : toNumber(value) || 0;
  return typeof value === "string" ? value : String(value);
}

// All editor state in one object so a single `buildAmount` derives the stored
// value from it — the mode, the fixed value, the table, and the optional
// quantity multiplier all feed one emit path (#937, #961).
interface EditorState {
  mode: "fixed" | "conditional";
  conditional: ConditionalAmount;
  /** The fixed-mode value; `undefined` means unset (no amount stored). */
  fixedAmount: number | undefined;
  /** Whether the quantity multiplier is switched on (the picker is visible). */
  quantityEnabled: boolean;
  /** Bare `stepId.fieldId` of the quantity field; "" until one is chosen. */
  quantityPath: string;
}

// Derive the stored `amount` from editor state. The multiplier only applies
// when it's enabled *and* a field is chosen — an empty path stores no `*`.
// Fixed mode with no multiplier preserves `undefined` (an unset amount); with a
// multiplier the base is the fixed number (unset → 0, since a price of nothing
// per unit is meaningless).
function buildAmount(
  state: EditorState,
): number | Record<string, unknown> | undefined {
  const path = state.quantityEnabled ? state.quantityPath.trim() : "";
  if (state.mode === "fixed") {
    if (!path) return state.fixedAmount;
    return compileAmount({ rules: [], default: state.fixedAmount ?? 0 }, path);
  }
  return compileAmount(state.conditional, path || undefined);
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
  // state seeded from the initial classification. A quantity multiplier, if
  // present, was peeled by parseAmount and surfaces as `quantityPath`.
  const [initial] = useState(() => parseAmount(amount));
  const [state, setState] = useState<EditorState>(() => {
    const quantityPath =
      initial.kind === "advanced" ? undefined : initial.quantityPath;
    return {
      mode: initial.kind === "conditional" ? "conditional" : "fixed",
      conditional:
        initial.kind === "conditional"
          ? initial.conditional
          : {
              rules: [],
              default: initial.kind === "fixed" ? initial.amount ?? 0 : 0,
            },
      fixedAmount: initial.kind === "fixed" ? initial.amount : undefined,
      quantityEnabled: quantityPath != null,
      quantityPath: quantityPath ?? "",
    };
  });

  const { mode, conditional } = state;
  const fid = (name: string) => `${idPrefix}-${name}`;
  // The quantity multiplier can only point at a numeric field, so a per-unit ×
  // quantity price never multiplies by text or a date (#961).
  const numericFields = fields.filter((f) => f.isNumeric);

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

  // The single emit path: patch state and re-derive the stored amount from it.
  const update = (patch: Partial<EditorState>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange(buildAmount(next));
  };

  // Patch just the conditional table.
  const emit = (next: ConditionalAmount) => update({ conditional: next });

  const switchMode = (next: "fixed" | "conditional") => {
    // Carry the visible value across the switch so neither mode clobbers a
    // value the author can see: fixed adopts the table's default; conditional
    // re-emits its (possibly bare-default) chain. buildAmount handles the rest,
    // including re-applying any quantity multiplier.
    if (next === "fixed") update({ mode: "fixed", fixedAmount: conditional.default });
    else update({ mode: "conditional" });
  };

  // Apply a patch to rule `i`, re-coercing its comparison value to the type its
  // (possibly changed) subject/operator now imply.
  const patchRule = (i: number, patch: Partial<AmountRule>) =>
    emit({
      ...conditional,
      rules: conditional.rules.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        return { ...next, value: coerceValue(next.value, wantsNumber(next.subject, next.operator)) };
      }),
    });

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
            value={state.fixedAmount ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              // Mirror the value into the table's default too, so switching to
              // conditional carries the value the author just typed.
              update({
                fixedAmount: raw === "" ? undefined : Number(raw),
                conditional: { ...conditional, default: toNumber(raw) },
              });
            }}
          />
        </div>
      ) : (
        <>
          {conditional.rules.map((rule, i) => {
            const numeric = wantsNumber(rule.subject, rule.operator);
            // An age comparison only makes sense against a date of birth, so
            // restrict the picker to DOB fields when this rule compares age
            // (#959). A value comparison stays unrestricted.
            const dobFields = fields.filter(isDobField);
            const conditionFields =
              rule.subject.kind === "age" ? dobFields : fields;
            return (
              <div key={i} className={styles.formGroup}>
                <label htmlFor={fid(`ruleSubject-${i}`)}>Compare</label>
                <select
                  id={fid(`ruleSubject-${i}`)}
                  value={rule.subject.kind}
                  onChange={(e) => {
                    const kind = e.target.value as AmountSubject["kind"];
                    // Switching to age drops a stale non-DOB path so the picker
                    // (now DOB-only) can't keep an invalid selection alive via
                    // its `(current)` fallback (#959).
                    const stillValid =
                      kind !== "age" ||
                      dobFields.some(
                        (f) => `${f.stepId}.${f.fieldId}` === rule.subject.path,
                      );
                    patchRule(i, {
                      subject: {
                        kind,
                        path: stillValid ? rule.subject.path : "",
                      },
                    });
                  }}
                >
                  <option value="field">Field value</option>
                  <option value="age">Age of field</option>
                </select>
                <label htmlFor={fid(`ruleField-${i}`)}>Condition field</label>
                <ValuePathPicker
                  id={fid(`ruleField-${i}`)}
                  value={rule.subject.path}
                  fields={conditionFields}
                  onChange={(path) =>
                    patchRule(i, { subject: { ...rule.subject, path } })
                  }
                />
                <label htmlFor={fid(`ruleOp-${i}`)}>Condition operator</label>
                <select
                  id={fid(`ruleOp-${i}`)}
                  value={rule.operator}
                  onChange={(e) =>
                    patchRule(i, { operator: e.target.value as AmountOperator })
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
                  type={numeric ? "number" : "text"}
                  value={rule.value}
                  onChange={(e) =>
                    patchRule(i, {
                      value: numeric ? toNumber(e.target.value) : e.target.value,
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
                    patchRule(i, { amount: toNumber(e.target.value) })
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
            );
          })}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              emit({
                ...conditional,
                rules: [
                  ...conditional.rules,
                  {
                    subject: { kind: "field", path: "" },
                    operator: "equal",
                    value: "",
                    amount: 0,
                  },
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
                emit({ ...conditional, default: toNumber(e.target.value) })
              }
            />
          </div>
        </>
      )}

      {/* Quantity multiplier — applies to both modes. When on and a field is
          chosen, the amount above is multiplied by that field (#961). */}
      <div className={styles.formGroup}>
        <label htmlFor={fid("quantityEnabled")}>
          <input
            id={fid("quantityEnabled")}
            type="checkbox"
            checked={state.quantityEnabled}
            onChange={(e) => update({ quantityEnabled: e.target.checked })}
          />{" "}
          Multiply by a quantity field
        </label>
      </div>
      {state.quantityEnabled && (
        <div className={styles.formGroup}>
          <label htmlFor={fid("quantityField")}>Quantity field</label>
          <ValuePathPicker
            id={fid("quantityField")}
            value={state.quantityPath}
            fields={numericFields}
            onChange={(path) => update({ quantityPath: path })}
          />
        </div>
      )}
    </>
  );
}
