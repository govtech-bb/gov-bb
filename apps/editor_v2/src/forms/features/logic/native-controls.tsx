import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  Asterisk,
  CaretDown,
  Check,
  Copy,
  DotsThreeVertical,
  Eye,
  EyeSlash,
  File,
  PencilSimple,
  Plus,
  Prohibit,
  Repeat,
  Sigma,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../../ui/button";
import { pill, PillInput } from "../../../ui/pill";
import { check, list, option, panel, popup } from "../../../ui/select";
import { FieldCombobox, header, More, Pick, typeGroups } from "../../react/logic-pickers";
import type { Field } from "./queries";
import { NativeFormulaPill, nativeFormula } from "../calculations/native-formula";
import "./authoring.css";
import type {
  Condition,
  DisplayReference,
  Expression,
  LogicAction,
  NativeReferenceValue,
  NativeScalar,
  RichText,
  RichTextInline,
  VisibilityTarget,
  CalculatedBlock,
} from "../../schema/types";
import {
  actionKinds,
  changeCondition,
  conditionKinds,
  expressionKind,
  expressionKinds,
  newAction,
  newCondition,
  newExpression,
  referenceWithScope,
  type NativePickItem,
  type NativeTargets,
  type ExpressionKind,
} from "./native-authoring";

const compactRow = "flex min-w-0 flex-wrap items-center gap-1";

export function LogicPopover({
  label,
  summary,
  children,
}: {
  label: string;
  summary?: string;
  children: ReactNode;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      editor.registerEditableListener((value) => {
        if (!value) setOpen(false);
      }),
    [editor],
  );

  return (
    <Popover.Root open={open && editable} onOpenChange={setOpen}>
      <Popover.Trigger
        data-logic-pill={summary === undefined ? undefined : ""}
        disabled={!editable}
        aria-label={label}
        render={summary === undefined ? <Button icon={<DotsThreeVertical />} /> : undefined}
        className={summary === undefined ? undefined : `${pill} cursor-pointer`}
      >
        {summary !== undefined && (
          <>
            <span className="min-w-0 truncate">{summary}</span>
            <CaretDown className="size-3 shrink-0 text-muted" />
          </>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          sideOffset={6}
          collisionPadding={8}
          sticky
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className="z-50 outline-none"
        >
          <Popover.Popup
            aria-label={label}
            className={`${panel} max-h-[min(36rem,75dvh,var(--available-height))] w-88 max-w-[calc(100vw-2rem)] overflow-y-auto p-3`}
          >
            <Popover.Title className="mb-3 text-14 font-semibold">{label}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function expressionLabel(value: Expression, targets: NativeTargets): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number") return String(value);

  if (typeof value === "string") return value || "Enter a value";

  if (!value || typeof value !== "object") return "Edit value";

  if ("answer" in value || "value" in value) {
    const name =
      "answer" in value
        ? (targets.questions.find((item) => item.value === value.answer)?.label ??
          (value.answer ? "Unavailable question" : "Select a question"))
        : (targets.calculated.find((item) => item.value === value.value)?.label ??
          (value.value ? "Unavailable calculated value" : "Select a calculated value"));

    return `${name}${value.scope === "form" ? " (whole form)" : value.scope === "current" ? " (same repeated entry)" : ""}`;
  }

  if ("context" in value)
    return value.context === "today"
      ? "Today"
      : value.context === "submittedAt"
        ? "Submission date and time"
        : "Submission reference";

  if (!Array.isArray(value.args)) return "Edit calculation";

  const args = value.args.map((argument) =>
    argument && typeof argument === "object" && "op" in argument
      ? `(${expressionLabel(argument, targets)})`
      : typeof argument === "string"
        ? JSON.stringify(argument)
        : expressionLabel(argument, targets),
  );

  const signs: Partial<Record<ExpressionKind, string>> = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
    concat: "+",
  };

  const sign = signs[value.op];

  if (sign) return args.join(` ${sign} `);

  if (value.op === "round") return `Round ${args[0]} to ${value.increment}`;

  if (value.op === "lookup") return `Look up ${args[0]} (${value.entries.length} rows)`;

  return `${expressionKinds.find(([kind]) => kind === value.op)?.[1] ?? "Calculation"}(${args.join(", ")})`;
}

export function NativeExpressionPill({
  value,
  targets,
  label,
  onChange,
  valueType,
}: {
  value: Expression;
  targets: NativeTargets;
  label: string;
  onChange(value: Expression): void;
  valueType?: CalculatedBlock["valueType"];
}) {
  if (nativeFormula(value, targets, valueType))
    return (
      <NativeFormulaPill
        value={value}
        targets={targets}
        label={label}
        valueType={valueType}
        onChange={onChange}
      />
    );

  return (
    <LogicPopover label={label} summary={`= ${expressionLabel(value, targets)}`}>
      <NativeExpressionEditor value={value} targets={targets} label={label} onChange={onChange} />
    </LogicPopover>
  );
}

/** Basic operands use the original typed-value and field picker; scopes stay on the reference. */
function NativeValuePick({
  value,
  targets,
  label,
  onChange,
}: {
  value: Expression;
  targets: NativeTargets;
  label: string;
  onChange(value: Expression): void;
}) {
  const [numberDraft, setNumberDraft] = useNumberDraft(value);

  const fields: (Field & { reference: NativeReferenceValue })[] = [
    ...targets.questions.map((question) => ({
      key: `answer:${question.value}`,
      type: "INPUT_FIELD" as const,
      kind: question.kind,
      title: question.label,
      reference: { answer: question.value },
    })),
    ...targets.calculated.map((field) => ({
      key: `value:${field.value}`,
      type: "CALCULATED_FIELD" as const,
      kind: field.kind === "string" ? "TEXT" : "NUMBER",
      title: field.label,
      reference: { value: field.value },
    })),
  ];

  const reference = record(value) && ("answer" in value || "value" in value) ? value : null;

  const key = reference
    ? "answer" in reference
      ? `answer:${reference.answer}`
      : `value:${reference.value}`
    : undefined;

  const kind = typeof value === "string" && numberDraft ? "number" : typeof value;

  const groups = typeGroups(
    fields.map((field) => ({
      ...field,
      title:
        field.key === key && reference?.scope
          ? `${field.title}${reference.scope === "form" ? " (whole form)" : " (same repeated entry)"}`
          : field.title,
    })),
  );

  const source = typeof value === "string" && numberDraft ? "number" : expressionKind(value);

  const footer = (
    <div className={stack}>
      <NativeSelect
        label="Value source"
        value={source}
        items={items(expressionKinds)}
        onChange={(kind) => {
          if (kind && kind !== source) {
            setNumberDraft(null);
            onChange(newExpression(kind));
          }
        }}
      />
      {reference && (
        <NativeSelect
          label="Answer scope"
          value={reference.scope ?? ""}
          items={scopeItems}
          onChange={(scope) => onChange(referenceWithScope(reference, scope))}
        />
      )}
    </div>
  );

  if (typeof value === "boolean")
    return (
      <Pick
        label={label}
        placeholder="Value"
        value={String(value)}
        items={booleanItems}
        footer={footer}
        onChange={(next) => onChange(next === "true")}
      />
    );

  if (typeof value === "object" && !reference)
    return (
      <LogicPopover label={label} summary={expressionLabel(value, targets)}>
        <NativeExpressionEditor value={value} targets={targets} label={label} onChange={onChange} />
      </LogicPopover>
    );

  return (
    <FieldCombobox
      groups={groups}
      value={key}
      typed={reference ? "" : (numberDraft?.text ?? String(value))}
      label={label}
      placeholder={reference ? "Select a field" : kind === "number" ? "Number" : "Value"}
      footer={footer}
      onSelect={(field) => {
        const selected = fields.find((item) => item.key === field.key);

        if (selected) {
          setNumberDraft(null);
          onChange(referenceWithScope(selected.reference, reference?.scope ?? ""));
        }
      }}
      onType={(text) => {
        const next = kind === "number" ? numeric(text) : text;
        setNumberDraft(kind === "number" ? { value: next, text } : null);
        onChange(next);
      }}
      onClear={() => {
        setNumberDraft(null);
        onChange("");
      }}
    />
  );
}

export function NativeConditionRow({
  value,
  targets,
  onChange,
  name = "Condition",
  onAdd,
  onRemove,
  onDuplicate,
}: {
  value: Condition;
  targets: NativeTargets;
  onChange(value: Condition): void;
  name?: string;
  onAdd?(): void;
  onRemove?(): void;
  onDuplicate?(): void;
}) {
  if (typeof value !== "boolean" && (!record(value) || typeof value.op !== "string"))
    return <NativeConditionEditor value={value} targets={targets} onChange={onChange} />;

  const kind = typeof value === "boolean" ? (value ? "always" : "never") : value.op;

  const group =
    typeof value !== "boolean" && "conditions" in value && Array.isArray(value.conditions)
      ? value
      : null;

  const menu = (
    <More
      label={group ? `${name} group options` : `${name} options`}
      size={group ? "sm" : undefined}
      items={[
        [
          "Add condition",
          Plus,
          onAdd ??
            (() =>
              onChange(
                group
                  ? { ...group, conditions: [...group.conditions, newCondition("eq")] }
                  : { op: "all", conditions: [value, newCondition("eq")] },
              )),
        ],
        !!onRemove && ["Remove", Trash, onRemove],
        [
          "Duplicate",
          Copy,
          onDuplicate ??
            (() => onChange({ op: "all", conditions: [value, structuredClone(value)] })),
        ],
        ["Wrap in group", Repeat, () => onChange({ op: "all", conditions: [value] })],
        !!group &&
          group.conditions.length === 1 && [
            "Unwrap group",
            Repeat,
            () => onChange(group.conditions[0]!),
          ],
      ]}
    />
  );

  const operator = (
    <Pick
      label="Condition"
      placeholder="Select condition"
      value={kind}
      items={conditionKinds.map(([value, label]) => ({
        value,
        label: value === "selected" ? "Is" : label,
      }))}
      onChange={(next) =>
        onChange(
          !group && (next === "all" || next === "any")
            ? { op: next, conditions: [value] }
            : changeCondition(value, next),
        )
      }
    />
  );

  if (group)
    return (
      <div
        role="group"
        aria-label={`${name} group`}
        className="flex min-w-0 flex-col gap-1 border-s-4 border-grey-20 ps-3"
      >
        <div className={header}>
          When
          <Select.Root
            value={group.op}
            onValueChange={(op) => (op === "all" || op === "any") && onChange({ ...group, op })}
          >
            <Select.Trigger
              aria-label="Match conditions"
              className="inline-flex min-h-6 cursor-pointer items-center gap-0.5 rounded-xs px-1 outline-none hover:bg-grey-20 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus [&>svg]:size-3"
            >
              {group.op === "any" ? "any" : "all"}
              <CaretDown />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner
                alignItemWithTrigger={false}
                align="start"
                sideOffset={6}
                className="z-50 outline-none"
              >
                <Select.Popup className={popup}>
                  <Select.List className={list}>
                    {(["all", "any"] as const).map((op) => (
                      <Select.Item key={op} value={op} className={option}>
                        <Select.ItemText>{op}</Select.ItemText>
                        <Select.ItemIndicator className={check}>
                          <Check />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
          match
          {menu}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {group.conditions.map((condition, index) => (
            <NativeConditionRow
              key={index}
              value={condition}
              targets={targets}
              name={`${name} ${index + 1}`}
              onChange={(next) =>
                onChange({
                  ...group,
                  conditions: group.conditions.map((old, at) => (at === index ? next : old)),
                })
              }
              onAdd={() =>
                onChange({
                  ...group,
                  conditions: [
                    ...group.conditions.slice(0, index + 1),
                    newCondition("eq"),
                    ...group.conditions.slice(index + 1),
                  ],
                })
              }
              onRemove={
                group.conditions.length > 1
                  ? () =>
                      onChange({
                        ...group,
                        conditions: group.conditions.filter((_, at) => at !== index),
                      })
                  : undefined
              }
              onDuplicate={() =>
                onChange({
                  ...group,
                  conditions: [
                    ...group.conditions.slice(0, index + 1),
                    structuredClone(condition),
                    ...group.conditions.slice(index + 1),
                  ],
                })
              }
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className={compactRow}>
      {typeof value !== "boolean" && value.op === "selected" ? (
        <>
          <Pick
            label="Question"
            placeholder="Select a question"
            value={value.question}
            items={targets.questions.filter((question) => question.options.length)}
            onChange={(question) => onChange({ ...value, question, option: "" })}
            footer={
              <NativeSelect
                label="Answer scope"
                value={value.scope ?? ""}
                items={scopeItems}
                onChange={(scope) => {
                  const next = { ...value };

                  if (scope === "current" || scope === "form") next.scope = scope;
                  else delete next.scope;
                  onChange(next);
                }}
              />
            }
          />
          {operator}
          <Pick
            label="Selected option"
            placeholder="Select option"
            value={value.option}
            items={
              targets.questions.find((question) => question.value === value.question)?.options ?? []
            }
            onChange={(option) => onChange({ ...value, option })}
          />
        </>
      ) : typeof value !== "boolean" && "left" in value ? (
        <>
          <NativeValuePick
            label="Compare"
            value={value.left}
            targets={targets}
            onChange={(left) => onChange({ ...value, left })}
          />
          {operator}
          <NativeValuePick
            label="With"
            value={value.right}
            targets={targets}
            onChange={(right) => onChange({ ...value, right })}
          />
        </>
      ) : typeof value !== "boolean" && value.op === "empty" ? (
        <>
          <NativeValuePick
            label="Value"
            value={value.value}
            targets={targets}
            onChange={(next) => onChange({ ...value, value: next })}
          />
          {operator}
        </>
      ) : (
        <>
          {operator}
          {typeof value !== "boolean" && value.op === "not" && (
            <NativeConditionRow
              value={value.condition}
              targets={targets}
              name={`${name} negated`}
              onChange={(condition) => onChange({ ...value, condition })}
            />
          )}
        </>
      )}
      {menu}
    </div>
  );
}

function VisibilityPicker({
  value,
  targets,
  onChange,
}: {
  value: VisibilityTarget[];
  targets: NativeTargets;
  onChange(value: VisibilityTarget[]): void;
}) {
  const [query, setQuery] = useState("");

  const options = [
    ...targets.visibility,
    ...value
      .filter((target) => !targets.visibility.some((item) => item.value === JSON.stringify(target)))
      .map((target) => ({
        value: JSON.stringify(target),
        label: `Unavailable target: ${JSON.stringify(target)}`,
        target,
      })),
  ];

  const selected = options.filter((item) =>
    value.some((target) => JSON.stringify(target) === item.value),
  );

  return (
    <LogicPopover
      label="Blocks and question parts"
      summary={
        selected.length === 1
          ? selected[0]!.label
          : selected.length
            ? `${selected.length} blocks`
            : "Select blocks"
      }
    >
      <input
        type="search"
        aria-label="Search blocks and question parts"
        placeholder="Search blocks…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-2 h-9 w-full rounded-sm bg-white px-2 text-14 shadow-input outline-none focus:shadow-input-focus"
      />
      <div className="max-h-80 overflow-y-auto">
        {options.flatMap((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
            ? [
                <label
                  key={item.value}
                  className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-14 hover:bg-tint"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 accent-interactive"
                    checked={selected.some((target) => target.value === item.value)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...value, item.target]
                          : value.filter((target) => JSON.stringify(target) !== item.value),
                      )
                    }
                  />
                  {item.label}
                </label>,
              ]
            : [],
        )}
      </div>
    </LogicPopover>
  );
}

type ActionChoice = NativePickItem & {
  type: LogicAction["type"];
  enabled: boolean;
  icon?: ReactNode;
};

function actionIcon(type: LogicAction["type"], enabled = true) {
  if (type === "setVisible") return enabled ? <Eye /> : <EyeSlash />;

  if (type === "setRequired") return <Asterisk />;

  if (type === "setValue") return <Sigma />;

  if (type === "goTo") return <File />;

  if (type === "error" || type === "setCompletionEnabled") return <Prohibit />;

  return <PencilSimple />;
}

const compactActions = actionKinds.flatMap<ActionChoice>(([type, label]) =>
  type === "setVisible" || type === "setRequired" || type === "setCompletionEnabled"
    ? [true, false].map((enabled) => ({
        value: `${type}:${enabled}`,
        type,
        enabled,
        icon: actionIcon(type, enabled),
        label:
          type === "setVisible"
            ? enabled
              ? "Show blocks"
              : "Hide blocks"
            : type === "setRequired"
              ? enabled
                ? "Require an answer"
                : "Make answer optional"
              : enabled
                ? "Enable Continue"
                : "Disable Continue",
      }))
    : [{ value: type, type, enabled: true, label, icon: actionIcon(type) }],
);

export function NativeActionRow({
  value,
  targets,
  onChange,
}: {
  value: LogicAction;
  targets: NativeTargets;
  onChange(value: LogicAction): void;
}) {
  if (
    !record(value) ||
    typeof value.type !== "string" ||
    (value.type === "setVisible" && !Array.isArray(value.targets))
  )
    return <NativeActionEditor value={value} targets={targets} onChange={onChange} />;

  const toggled =
    value.type === "setVisible" ||
    value.type === "setRequired" ||
    value.type === "setCompletionEnabled";

  return (
    <div className={compactRow}>
      <Pick
        label="Action"
        placeholder="Select action"
        value={toggled ? `${value.type}:${value.value}` : value.type}
        items={compactActions}
        onChange={(selected) => {
          const item = compactActions.find((item) => item.value === selected);

          if (!item) return;
          const next = item.type === value.type ? value : newAction(item.type);
          onChange(
            next.type === "setVisible" ||
              next.type === "setRequired" ||
              next.type === "setCompletionEnabled"
              ? { ...next, value: item.enabled }
              : next,
          );
        }}
      />
      {"target" in value && (
        <Pick
          label="Target"
          placeholder="Select target"
          value={value.target}
          items={
            value.type === "setValue"
              ? targets.calculated
              : value.type === "setTitle" || value.type === "goTo"
                ? targets.pages
                : value.type === "error"
                  ? [...targets.questions, ...targets.pages]
                  : targets.questions
          }
          onChange={(target) => onChange({ ...value, target })}
        />
      )}
      {value.type === "setVisible" && (
        <VisibilityPicker
          value={value.targets}
          targets={targets}
          onChange={(next) => onChange({ ...value, targets: next })}
        />
      )}
      {value.type === "setValue" && (
        <NativeExpressionPill
          label="Calculated value"
          value={value.value}
          targets={targets}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      )}
      {(value.type === "setLabel" || value.type === "setTitle") && (
        <LogicPopover
          label={value.type === "setTitle" ? "New page heading" : "New question label"}
          summary={
            typeof value.value === "string" ? value.value || "Enter text" : "Edit text with answers"
          }
        >
          <NativeRichTextEditor
            value={value.value}
            targets={targets}
            label={value.type === "setTitle" ? "New page heading" : "New question label"}
            onChange={(next) => onChange({ ...value, value: next })}
          />
        </LogicPopover>
      )}
      {value.type === "error" && (
        <span className={pill}>
          <PillInput
            placeholder="Error message"
            value={value.message}
            onChange={(message) => onChange({ ...value, message })}
          />
        </span>
      )}
    </div>
  );
}

const input =
  "min-h-8 min-w-0 rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none focus:shadow-input-focus";

const stack = "flex min-w-0 flex-col gap-2";

export function NativeSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: readonly NativePickItem<T>[];
  onChange(value: T | ""): void;
}) {
  const id = useId();

  return (
    <label htmlFor={id} className={stack}>
      <span className="text-12 text-muted">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const selected = items.find((item) => item.value === event.target.value);

          if (selected) onChange(selected.value);
          else if (event.target.value === "") onChange("");
        }}
        className={input}
      >
        {!items.some((item) => item.value === "") && <option value="">Select…</option>}
        {!!value && !items.some((item) => item.value === value) && (
          <option value={value}>{value} (unavailable)</option>
        )}
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NativeInput({
  label,
  value,
  onChange,
  numeric = false,
}: {
  label: string;
  value: string | number;
  onChange(value: string): void;
  numeric?: boolean;
}) {
  return (
    <label className={stack}>
      <span className="text-12 text-muted">{label}</span>
      <input
        aria-label={label}
        inputMode={numeric ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={input}
      />
    </label>
  );
}

const items = <const T extends string>(
  entries: readonly (readonly [T, string])[],
): NativePickItem<T>[] => entries.map(([value, label]) => ({ value, label }));

const numeric = (value: string): NativeScalar =>
  value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;

function useNumberDraft(value: Expression) {
  const [draft, setDraft] = useState<{ value: NativeScalar; text: string } | null>(null);
  const [previous, setPrevious] = useState(value);

  // Lexical commits after the input event; only a changed prop can invalidate a local draft.
  if (previous !== value) {
    setPrevious(value);

    if (draft && draft.value !== value) {
      setDraft(null);

      return [null, setDraft] as const;
    }
  }

  return [draft, setDraft] as const;
}

const booleanItems = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const scopeItems = [
  { value: "", label: "Automatic" },
  { value: "current", label: "Same repeated entry" },
  { value: "form", label: "Whole form" },
];

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function Repair({ label, onRepair }: { label: string; onRepair(): void }) {
  return (
    <div role="status" className={stack}>
      This {label} needs repair.{" "}
      <Button size="sm" onClick={onRepair}>
        Replace {label}
      </Button>
    </div>
  );
}

export function NativeReferenceEditor({
  value,
  onChange,
  targets,
}: {
  value: NativeReferenceValue;
  onChange(value: NativeReferenceValue): void;
  targets: NativeTargets;
}) {
  if (!record(value) || !("answer" in value || "value" in value || "context" in value))
    return <Repair label="reference" onRepair={() => onChange({ answer: "" })} />;
  const kind = "answer" in value ? "answer" : "value" in value ? "value" : "context";

  const selected =
    "answer" in value ? value.answer : "value" in value ? value.value : value.context;

  const options =
    kind === "answer"
      ? targets.questions
      : kind === "value"
        ? targets.calculated
        : [
            { value: "today", label: "Today" },
            { value: "submissionReference", label: "Submission reference" },
            { value: "submittedAt", label: "Submission date and time" },
          ];

  return (
    <div className={stack}>
      <NativeSelect
        label="Reference type"
        value={kind}
        items={items([
          ["answer", "Question answer"],
          ["value", "Calculated value"],
          ["context", "Form information"],
        ])}
        onChange={(next) => {
          if (next === "answer") onChange({ answer: "" });
          else if (next === "value") onChange({ value: "" });
          else if (next === "context") onChange({ context: "today" });
        }}
      />
      <NativeSelect
        label="Reference"
        value={selected}
        items={options}
        onChange={(next) => {
          if ("answer" in value) onChange({ ...value, answer: next });
          else if ("value" in value) onChange({ ...value, value: next });
          else if (next === "today" || next === "submissionReference" || next === "submittedAt")
            onChange({ ...value, context: next });
        }}
      />
      {kind !== "context" && (
        <NativeSelect
          label="Answer scope"
          value={"scope" in value ? (value.scope ?? "") : ""}
          items={scopeItems}
          onChange={(scope) => onChange(referenceWithScope(value, scope))}
        />
      )}
    </div>
  );
}

export function NativeExpressionEditor({
  value,
  onChange,
  targets,
  label = "Value",
}: {
  value: Expression;
  onChange(value: Expression): void;
  targets: NativeTargets;
  label?: string;
}) {
  const [numberDraft, setNumberDraft] = useNumberDraft(value);

  if (
    !["string", "number", "boolean"].includes(typeof value) &&
    (!record(value) ||
      !("op" in value || "answer" in value || "value" in value || "context" in value))
  )
    return <Repair label="value" onRepair={() => onChange(0)} />;

  const kind = typeof value === "string" && numberDraft ? "number" : expressionKind(value);

  const operation = typeof value === "object" && "op" in value ? value : null;

  if (
    operation &&
    (!Array.isArray(operation.args) ||
      (operation.op === "lookup" &&
        (!Array.isArray(operation.entries) || !operation.entries.every(record))))
  )
    return <Repair label="calculation" onRepair={() => onChange(0)} />;

  const variadic =
    operation &&
    ["add", "subtract", "multiply", "divide", "min", "max", "concat"].includes(operation.op);

  return (
    <fieldset className="min-w-0 rounded-sm border border-line p-2">
      <legend className="px-1 text-12 font-semibold text-muted">{label}</legend>
      <div className={stack}>
        <NativeSelect
          label="Value source"
          value={kind}
          items={items(expressionKinds)}
          onChange={(next) => {
            if (next) {
              setNumberDraft(null);
              onChange(newExpression(next));
            }
          }}
        />
        {typeof value === "number" || typeof value === "string" ? (
          <NativeInput
            label={kind === "number" ? "Number" : "Text"}
            value={numberDraft?.text ?? value}
            numeric={kind === "number"}
            onChange={(next) => {
              const result = kind === "number" ? numeric(next) : next;
              setNumberDraft(kind === "number" ? { value: result, text: next } : null);
              onChange(result);
            }}
          />
        ) : null}
        {typeof value === "boolean" ? (
          <NativeSelect
            label="Yes or no"
            value={String(value)}
            items={booleanItems}
            onChange={(next) => onChange(next === "true")}
          />
        ) : null}
        {typeof value === "object" && !("op" in value) ? (
          <NativeReferenceEditor value={value} targets={targets} onChange={onChange} />
        ) : null}
        {operation ? (
          <>
            {operation.args.map((argument, index) => (
              <div key={index} className={stack}>
                <NativeExpressionEditor
                  value={argument}
                  targets={targets}
                  label={`${["monthsBetween", "wholeYearsBetween", "daysBetween"].includes(operation.op) ? (index === 0 ? "Start date" : "End date") : `Value ${index + 1}`}`}
                  onChange={(next) => {
                    const changed = structuredClone(operation);
                    changed.args[index] = next;
                    onChange(changed);
                  }}
                />
                {variadic && operation.args.length > 2 ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      const changed = structuredClone(operation);
                      changed.args.splice(index, 1);
                      onChange(changed);
                    }}
                  >
                    Remove value {index + 1}
                  </Button>
                ) : null}
              </div>
            ))}
            {variadic ? (
              <Button
                size="sm"
                onClick={() => {
                  const changed = structuredClone(operation);
                  changed.args.push(operation.op === "concat" ? "" : 0);
                  onChange(changed);
                }}
              >
                Add value
              </Button>
            ) : null}
            {operation.op === "round" ? (
              <>
                <NativeInput
                  label="Round to the nearest"
                  numeric
                  value={operation.increment}
                  onChange={(next) => {
                    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain incomplete draft text; native export validation requires a numeric increment.
                    onChange({ ...operation, increment: numeric(next) as number });
                  }}
                />
              </>
            ) : null}
            {operation.op === "lookup" ? (
              <>
                {operation.entries.map((entry, index) => (
                  <fieldset key={index} className="min-w-0 border-s border-line ps-2">
                    <legend className="text-12 text-muted">Lookup row {index + 1}</legend>
                    <NativeLiteralEditor
                      value={entry.key}
                      label="Match value"
                      onChange={(key) =>
                        onChange({
                          ...operation,
                          entries: operation.entries.map((row, at) =>
                            at === index ? { ...row, key } : row,
                          ),
                        })
                      }
                    />
                    <NativeExpressionEditor
                      value={entry.value}
                      targets={targets}
                      label="Result"
                      onChange={(next) =>
                        onChange({
                          ...operation,
                          entries: operation.entries.map((row, at) =>
                            at === index ? { ...row, value: next } : row,
                          ),
                        })
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        onChange({
                          ...operation,
                          entries: operation.entries.filter((_, at) => at !== index),
                        })
                      }
                    >
                      Remove lookup row {index + 1}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...operation,
                      entries: [...operation.entries, { key: "", value: 0 }],
                    })
                  }
                >
                  Add lookup row
                </Button>
                <NativeExpressionEditor
                  value={operation.fallback}
                  targets={targets}
                  label="When no row matches"
                  onChange={(fallback) => onChange({ ...operation, fallback })}
                />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </fieldset>
  );
}

export function NativeLiteralEditor({
  value,
  label,
  onChange,
}: {
  value: NativeScalar;
  label: string;
  onChange(value: NativeScalar): void;
}) {
  const [numberDraft, setNumberDraft] = useNumberDraft(value);

  if (!["string", "number", "boolean"].includes(typeof value))
    return <Repair label="value" onRepair={() => onChange("")} />;
  const kind = typeof value === "string" && numberDraft ? "number" : typeof value;

  return (
    <div className={stack}>
      <NativeSelect
        label={`${label} type`}
        value={kind}
        items={items([
          ["string", "Text"],
          ["number", "Number"],
          ["boolean", "Yes or no"],
        ])}
        onChange={(type) => {
          setNumberDraft(null);
          onChange(type === "number" ? 0 : type === "boolean" ? false : "");
        }}
      />
      {typeof value === "boolean" ? (
        <NativeSelect
          label={label}
          value={String(value)}
          items={booleanItems}
          onChange={(next) => onChange(next === "true")}
        />
      ) : (
        <NativeInput
          label={label}
          value={numberDraft?.text ?? value}
          numeric={kind === "number"}
          onChange={(next) => {
            const result = kind === "number" ? numeric(next) : next;
            setNumberDraft(kind === "number" ? { value: result, text: next } : null);
            onChange(result);
          }}
        />
      )}
    </div>
  );
}

export function NativeConditionEditor({
  value,
  onChange,
  targets,
}: {
  value: Condition;
  onChange(value: Condition): void;
  targets: NativeTargets;
}) {
  if (
    typeof value !== "boolean" &&
    (!record(value) ||
      typeof value.op !== "string" ||
      ("conditions" in value && !Array.isArray(value.conditions)))
  )
    return <Repair label="condition" onRepair={() => onChange(newCondition("eq"))} />;
  const kind = typeof value === "boolean" ? (value ? "always" : "never") : value.op;

  return (
    <div className={stack}>
      <NativeSelect
        label="Condition"
        value={kind}
        items={items(conditionKinds)}
        onChange={(next) => {
          if (next) onChange(changeCondition(value, next));
        }}
      />
      {typeof value !== "boolean" && "conditions" in value ? (
        <div className="flex flex-col gap-2 border-s border-line ps-3">
          {value.conditions.map((condition, index) => (
            <div key={index} className={stack}>
              <NativeConditionEditor
                value={condition}
                targets={targets}
                onChange={(next) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.map((row, at) => (at === index ? next : row)),
                  })
                }
              />
              <Button
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: value.conditions.filter((_, at) => at !== index),
                  })
                }
              >
                Remove condition {index + 1}
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            onClick={() =>
              onChange({ ...value, conditions: [...value.conditions, newCondition("eq")] })
            }
          >
            Add condition
          </Button>
        </div>
      ) : null}
      {typeof value !== "boolean" && value.op === "not" ? (
        <NativeConditionEditor
          value={value.condition}
          targets={targets}
          onChange={(condition) => onChange({ ...value, condition })}
        />
      ) : null}
      {typeof value !== "boolean" && "left" in value ? (
        <>
          <NativeExpressionEditor
            value={value.left}
            targets={targets}
            label="Compare"
            onChange={(left) => onChange({ ...value, left })}
          />
          <NativeExpressionEditor
            value={value.right}
            targets={targets}
            label="With"
            onChange={(right) => onChange({ ...value, right })}
          />
        </>
      ) : null}
      {typeof value !== "boolean" && value.op === "empty" ? (
        <NativeExpressionEditor
          value={value.value}
          targets={targets}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      ) : null}
      {typeof value !== "boolean" && value.op === "selected" ? (
        <>
          <NativeSelect
            label="Question"
            value={value.question}
            items={targets.questions.filter((question) => question.options.length)}
            onChange={(question) => onChange({ ...value, question, option: "" })}
          />
          <NativeSelect
            label="Selected option"
            value={value.option}
            items={
              targets.questions.find((question) => question.value === value.question)?.options ?? []
            }
            onChange={(option) => onChange({ ...value, option })}
          />
          <NativeSelect
            label="Answer scope"
            value={value.scope ?? ""}
            items={scopeItems}
            onChange={(scope) => {
              const next = { ...value };

              if (scope === "current" || scope === "form") next.scope = scope;
              else delete next.scope;
              onChange(next);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export function NativeRichTextEditor({
  value,
  onChange,
  targets,
  label,
}: {
  value: RichText;
  onChange(value: RichText): void;
  targets: NativeTargets;
  label: string;
}) {
  const parts = typeof value === "string" ? [value] : value;

  if (
    !Array.isArray(parts) ||
    !parts.every(
      (part) =>
        typeof part === "string" ||
        (record(part) && (!("marks" in part) || Array.isArray(part.marks))),
    )
  )
    return <Repair label="text" onRepair={() => onChange("")} />;

  const set = (index: number, next: RichTextInline) =>
    onChange(parts.map((part, at) => (at === index ? next : part)));

  return (
    <fieldset className="min-w-0 border border-line p-2">
      <legend className="px-1 text-12 text-muted">{label}</legend>
      <div className={stack}>
        {parts.map((part, index) => (
          <div key={index} className={stack}>
            {typeof part === "string" ? (
              <NativeInput
                label={`${label} text ${index + 1}`}
                value={part}
                onChange={(next) => (typeof value === "string" ? onChange(next) : set(index, next))}
              />
            ) : "text" in part ? (
              <>
                <NativeInput
                  label={`${label} text ${index + 1}`}
                  value={part.text}
                  onChange={(text) => set(index, { ...part, text })}
                />
                <div className="flex flex-wrap gap-2">
                  {(["bold", "italic", "underline", "strikethrough", "code"] as const).map(
                    (mark) => (
                      <label key={mark} className="text-12">
                        <input
                          type="checkbox"
                          checked={part.marks?.includes(mark) ?? false}
                          onChange={(event) =>
                            set(index, {
                              ...part,
                              marks: event.target.checked
                                ? [...(part.marks ?? []), mark]
                                : (part.marks?.filter((value) => value !== mark) ?? []),
                            })
                          }
                        />{" "}
                        {mark}
                      </label>
                    ),
                  )}
                </div>
              </>
            ) : "break" in part ? (
              <span className="text-12 text-muted">Line break</span>
            ) : "link" in part ? (
              <>
                <NativeInput
                  label="Link URL"
                  value={part.link}
                  onChange={(link) => set(index, { ...part, link })}
                />
                <NativeRichTextEditor
                  value={part.content}
                  targets={targets}
                  label="Link text"
                  onChange={(content) => set(index, { ...part, content })}
                />
              </>
            ) : (
              <NativeDisplayReferenceEditor
                value={part}
                targets={targets}
                onChange={(next) => set(index, next)}
              />
            )}
            {parts.length > 1 ? (
              <Button size="sm" onClick={() => onChange(parts.filter((_, at) => at !== index))}>
                Remove text part {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        <NativeSelect
          label={`Add to ${label.toLowerCase()}`}
          value=""
          items={items([
            ["text", "Text"],
            ["formatted", "Formatted text"],
            ["answer", "Answer or calculated value"],
            ["link", "Link"],
            ["break", "Line break"],
          ])}
          onChange={(kind) =>
            onChange([
              ...parts,
              kind === "text"
                ? ""
                : kind === "formatted"
                  ? { text: "", marks: [] }
                  : kind === "link"
                    ? { link: "", content: "" }
                    : kind === "break"
                      ? { break: true }
                      : { answer: "" },
            ])
          }
        />
      </div>
    </fieldset>
  );
}

export function NativeDisplayReferenceEditor({
  value,
  onChange,
  targets,
}: {
  value: DisplayReference;
  onChange(value: DisplayReference): void;
  targets: NativeTargets;
}) {
  if (!record(value)) return <Repair label="reference" onRepair={() => onChange({ answer: "" })} />;
  const format = value.format;

  return (
    <div className={stack}>
      <NativeReferenceEditor
        value={value}
        targets={targets}
        onChange={(reference) =>
          onChange({
            ...reference,
            ...(format && { format }),
            ...(value.fallback !== undefined && { fallback: value.fallback }),
          })
        }
      />
      <NativeSelect
        label="Display as"
        value={format?.type ?? ""}
        items={items([
          ["", "Automatic"],
          ["number", "Number"],
          ["currency", "Currency"],
          ["date", "Date"],
          ["choice-label", "Option label"],
          ["boolean-label", "Yes or no label"],
        ])}
        onChange={(type) => {
          const next = { ...value };

          if (!type) delete next.format;
          else
            next.format =
              type === "currency" ? { type, currency: "BBD", fractionDigits: 2 } : { type };
          onChange(next);
        }}
      />
      {format?.type === "number" || format?.type === "currency" ? (
        <NativeInput
          label="Decimal places"
          numeric
          value={format.fractionDigits ?? ""}
          onChange={(next) => {
            const changed = { ...format };

            if (next === "") delete changed.fractionDigits;
            else {
              // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Retain incomplete draft text; native export validation requires numeric fractionDigits.
              changed.fractionDigits = numeric(next) as number;
            }

            onChange({ ...value, format: changed });
          }}
        />
      ) : null}
      {format?.type === "currency" ? (
        <NativeInput
          label="Currency code"
          value={format.currency}
          onChange={(currency) => onChange({ ...value, format: { ...format, currency } })}
        />
      ) : null}
      {format?.type === "date" ? (
        <NativeSelect
          label="Date style"
          value={format.style ?? ""}
          items={items([
            ["", "Automatic"],
            ["short", "Short"],
            ["medium", "Medium"],
            ["long", "Long"],
            ["full", "Full"],
          ])}
          onChange={(style) => {
            const changed = { ...format };

            if (style) changed.style = style;
            else delete changed.style;
            onChange({ ...value, format: changed });
          }}
        />
      ) : null}
      {format?.type === "boolean-label" ? (
        <>
          <NativeInput
            label="Label for yes"
            value={format.trueLabel ?? ""}
            onChange={(trueLabel) => onChange({ ...value, format: { ...format, trueLabel } })}
          />
          <NativeInput
            label="Label for no"
            value={format.falseLabel ?? ""}
            onChange={(falseLabel) => onChange({ ...value, format: { ...format, falseLabel } })}
          />
        </>
      ) : null}
      <NativeInput
        label="Text when the answer is empty"
        value={value.fallback ?? ""}
        onChange={(fallback) => onChange({ ...value, fallback })}
      />
    </div>
  );
}

export function NativeActionEditor({
  value,
  onChange,
  targets,
}: {
  value: LogicAction;
  onChange(value: LogicAction): void;
  targets: NativeTargets;
}) {
  if (
    !record(value) ||
    typeof value.type !== "string" ||
    (value.type === "setVisible" && !Array.isArray(value.targets))
  )
    return <Repair label="action" onRepair={() => onChange(newAction("setVisible"))} />;

  return (
    <div className={stack}>
      <NativeSelect
        label="Action"
        value={value.type}
        items={items(actionKinds)}
        onChange={(type) => {
          if (type) onChange(newAction(type));
        }}
      />
      {"target" in value ? (
        <NativeSelect
          label="Target"
          value={value.target}
          items={
            value.type === "setValue"
              ? targets.calculated
              : value.type === "setTitle" || value.type === "goTo"
                ? targets.pages
                : value.type === "error"
                  ? [...targets.questions, ...targets.pages]
                  : targets.questions
          }
          onChange={(target) => onChange({ ...value, target })}
        />
      ) : null}
      {value.type === "setVisible" ? (
        <fieldset>
          <legend className="text-12 text-muted">Blocks and question parts</legend>
          <div className="max-h-48 overflow-y-auto">
            {[
              ...targets.visibility,
              ...value.targets
                .filter(
                  (target) =>
                    !targets.visibility.some((item) => item.value === JSON.stringify(target)),
                )
                .map((target) => ({
                  value: JSON.stringify(target),
                  label: `Unavailable target: ${JSON.stringify(target)}`,
                  target,
                })),
            ].map((item) => (
              <label key={item.value} className="flex items-start gap-2 py-1 text-12">
                <input
                  type="checkbox"
                  checked={value.targets.some((target) => JSON.stringify(target) === item.value)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      targets: event.target.checked
                        ? [...value.targets, item.target]
                        : value.targets.filter((target) => JSON.stringify(target) !== item.value),
                    })
                  }
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {value.type === "setVisible" ||
      value.type === "setRequired" ||
      value.type === "setCompletionEnabled" ? (
        <NativeSelect
          label={
            value.type === "setVisible"
              ? "Visible"
              : value.type === "setRequired"
                ? "Answer required"
                : "Continue enabled"
          }
          value={String(value.value)}
          items={booleanItems}
          onChange={(next) => onChange({ ...value, value: next === "true" })}
        />
      ) : null}
      {value.type === "setValue" ? (
        <NativeExpressionEditor
          value={value.value}
          targets={targets}
          label="Calculated value"
          onChange={(next) => onChange({ ...value, value: next })}
        />
      ) : null}
      {value.type === "setTitle" || value.type === "setLabel" ? (
        <NativeRichTextEditor
          value={value.value}
          targets={targets}
          label={value.type === "setTitle" ? "New page heading" : "New question label"}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      ) : null}
      {value.type === "error" ? (
        <NativeInput
          label="Error message"
          value={value.message}
          onChange={(message) => onChange({ ...value, message })}
        />
      ) : null}
    </div>
  );
}
