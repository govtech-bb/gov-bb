import { useEditorDefinition } from "../../../editor/react/composer";
import { formDefinition } from "../../definition";
import { conditionalLogic } from "../../core/logic";
import { Select } from "@base-ui/react/select";
import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from "lexical";
import {
  ArrowsSplit,
  CaretDown,
  Check,
  Copy,
  Divide,
  Equals,
  File,
  Function as Formula,
  type Icon,
  MinusSquare,
  Plus,
  PlusSquare,
  Repeat,
  Smiley,
  Trash,
  XSquare,
} from "@phosphor-icons/react";
import { useMemo, type ReactNode } from "react";
import { cn } from "../../../cn";
import { Button } from "../../../ui/button";
import { pill } from "../../../ui/pill";
import { check, list, option, popup } from "../../../ui/select";
import { Tip } from "../../../ui/tooltip";
import type { Action, CalculateOperator, Condition, LogicalOperator } from "../../core/logic";
import { ageConditionError, conditionMode } from "../../core/logic-age";
import { $hideShowTargets, $logicActions, $setLogicActions, $showTargetBlocks } from "./authoring";
import { $createWidgetNode, $isPageBreak, $settings, type Setting } from "../../editor/nodes";
import { useSetSettings, type WidgetProps } from "../../react/widget-settings";
import { type Field, $fields, type Page, $pages, type TreeNode, $blockTree } from "./queries";
import { empty, anyOf, comparisons, comparisonLabel } from "./comparisons";
import { useRead, useEditableUpdate } from "../../react/logic-hooks";
import {
  type FieldGroup,
  typeGroups,
  pickerGroups,
  surface,
  Caption,
  row,
  header,
  Scroll,
  More,
  pillValue,
  popupLayer,
  Pick,
  OptionsPick,
  FieldCombobox,
  ValuePick,
  DatePick,
  TimePick,
  BlocksPick,
} from "../../react/logic-pickers";
import { formulaOf, FormulaPill } from "../calculations/formula-editor";
import { $native } from "../../editor/native-state";
import { NativeConditionalLogic } from "./native-presentation";

export const json = (value: Setting) => value;

export const newId = () => crypto.randomUUID();

export const numberOperators: [CalculateOperator, string, Icon][] = [
  ["ADDITION", "Add", PlusSquare],
  ["SUBTRACTION", "Subtract", MinusSquare],
  ["MULTIPLICATION", "Multiply", XSquare],
  ["DIVISION", "Divide", Divide],
  ["ASSIGNMENT", "Assign", Equals],
  ["FORMULA", "Formula", Formula],
];

export const textOperators: [CalculateOperator, string, Icon][] = [
  ["ASSIGNMENT", "Assign", Equals],
  ["ADDITION", "Concat", PlusSquare],
  ["FORMULA", "Formula", Formula],
];

export const operatorsFor = (kind?: string) => (kind === "TEXT" ? textOperators : numberOperators);

export type Handlers = {
  update: (c: Condition) => void;
  add: () => void;
  remove: () => void;
  duplicate: () => void;
  wrap?: () => void;
  unwrap?: () => void;
};

export const copyCondition = (c: Condition): Condition =>
  c.type === "GROUP"
    ? { ...c, id: newId(), conditionals: c.conditionals.map(copyCondition) }
    : { ...c, id: newId() };

export function Conditions({
  list: conditions,
  operator,
  within,
  onChange,
  ctx,
}: {
  list: Condition[];
  operator: LogicalOperator;
  within: boolean;
  onChange: (next: Condition[]) => void;
  ctx: LogicContext;
}) {
  const at = (i: number): Handlers => ({
    update: (c) => onChange(conditions.map((d, j) => (j === i ? c : d))),
    add: () =>
      onChange([
        ...conditions.slice(0, i + 1),
        { id: newId(), type: "SINGLE" },
        ...conditions.slice(i + 1),
      ]),
    remove: () => onChange(conditions.filter((_, j) => j !== i)),
    duplicate: () =>
      onChange([
        ...conditions.slice(0, i + 1),
        copyCondition(conditions[i]!),
        ...conditions.slice(i + 1),
      ]),
  });

  return conditions.map((c, i) => {
    const handlers = at(i);

    if (c.type === "SINGLE")
      return (
        <ConditionRow
          key={c.id}
          condition={c}
          ctx={ctx}
          handlers={{
            ...handlers,
            wrap: within
              ? undefined
              : () =>
                  handlers.update({
                    id: newId(),
                    type: "GROUP",
                    logicalOperator: "AND",
                    conditionals: [c],
                  }),
          }}
        />
      );

    return (
      <div
        key={c.id}
        className={cn(
          "mt-1 flex flex-col gap-1 border-l border-grey-40 pl-3",
          conditions[i + 1]?.type === "SINGLE" && "mb-1",
        )}
      >
        <div className={header}>
          {i === 0 ? "When" : operator === "OR" ? "Or" : "And"}
          <Match
            conditionals={c.conditionals}
            value={c.logicalOperator}
            onChange={(logicalOperator) => handlers.update({ ...c, logicalOperator })}
          />
          {!within && (
            <ConditionMenu
              size="sm"
              handlers={{
                ...handlers,
                unwrap:
                  c.conditionals.length === 1
                    ? () => handlers.update(copyCondition(c.conditionals[0]!))
                    : undefined,
              }}
            />
          )}
        </div>
        <Conditions
          list={c.conditionals}
          operator={c.logicalOperator}
          within
          onChange={(conditionals) => handlers.update({ ...c, conditionals })}
          ctx={ctx}
        />
      </div>
    );
  });
}

export function ConditionMenu({ handlers: h, size }: { handlers: Handlers; size?: "sm" }) {
  return (
    <More
      label="Add, remove, and more..."
      size={size}
      items={[
        ["Add condition", Plus, h.add],
        ["Remove", Trash, h.remove],
        ["Duplicate", Copy, h.duplicate],
        !!h.wrap && ["Wrap in group", Repeat, h.wrap],
        !!h.unwrap && ["Unwrap group", Repeat, h.unwrap],
      ]}
    />
  );
}

export function Match({
  conditionals,
  value,
  onChange,
}: {
  conditionals: Condition[];
  value: LogicalOperator;
  onChange: (v: LogicalOperator) => void;
}) {
  if (conditionals.length <= 1) return null;

  return (
    <>
      <Select.Root<LogicalOperator> value={value} onValueChange={(v) => v && onChange(v)}>
        <Select.Trigger
          aria-label={value === "OR" ? "any" : "all"}
          className="inline-flex min-h-6 cursor-pointer items-center gap-0.5 rounded-xs px-1 outline-none hover:bg-hover focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus [&>svg]:size-3"
        >
          {value === "OR" ? "any" : "all"}
          <CaretDown />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            alignItemWithTrigger={false}
            align="start"
            sideOffset={6}
            className={popupLayer}
          >
            <Select.Popup className={popup}>
              <Select.List className={list}>
                {(["AND", "OR"] as const).map((op) => (
                  <Select.Item key={op} value={op} className={option}>
                    <Select.ItemText className="min-w-0 flex-1">
                      {op === "OR" ? "any" : "all"}
                    </Select.ItemText>
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
    </>
  );
}

export function ConditionRow({
  condition: c,
  ctx,
  handlers,
}: {
  condition: Condition & { type: "SINGLE" };
  ctx: LogicContext;
  handlers: Handlers;
}) {
  const update = useEditableUpdate();
  const field = ctx.fields.find((f) => f.key === c.field);

  const set = (patch: Partial<typeof c>) => {
    const next = { ...c };

    if (c.valueIsLiteral && "comparison" in patch) next.value = "";
    handlers.update({ ...next, ...patch, valueIsLiteral: undefined });
  };

  const comparison = c.comparison;
  const importedTransform = c.transform && c.transform !== "yearsSince";
  let value: ReactNode = null;

  if (!comparison || !empty.includes(comparison)) {
    const multiple = !!comparison && anyOf.includes(comparison);

    const number =
      (field?.type === "CALCULATED_FIELD" && field.kind === "NUMBER") ||
      (field?.type === "INPUT_FIELD" && field.kind === "number");

    const options = field?.type === "INPUT_FIELD" ? field.options : undefined;
    value =
      field?.kind === "date" && c.transform === "yearsSince" ? (
        <label className="flex flex-col gap-1">
          <input
            aria-label="Age in years"
            type="number"
            min="0"
            step="1"
            value={typeof c.value === "number" || typeof c.value === "string" ? c.value : ""}
            onChange={(event) =>
              set({ value: event.target.value === "" ? "" : Number(event.target.value) })
            }
            className="h-8 w-24 rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none focus:shadow-input-focus"
          />
          {ageConditionError(c, field.kind) && (
            <span className="max-w-52 text-12 text-error">{ageConditionError(c, field.kind)}</span>
          )}
        </label>
      ) : field?.kind === "date" ? (
        <DatePick value={c.value} onChange={(v) => set({ value: v })} />
      ) : field?.kind === "time" ? (
        <TimePick key={field.key} value={c.value} onChange={(v) => set({ value: v })} />
      ) : options ? (
        <OptionsPick
          options={options}
          value={c.value}
          multiple={multiple}
          onChange={(v) => set({ value: v })}
        />
      ) : (
        <ValuePick
          key={field?.key}
          groups={ctx.groups}
          value={c.value}
          number={number}
          placeholder="Value"
          onChange={(v) => set({ value: v })}
        />
      );
  }

  return (
    <div className={row}>
      <FieldCombobox
        groups={ctx.groups}
        value={c.field}
        placeholder="Select field"
        emptyText="No results"
        onSelect={(f) =>
          set({ field: f.key, comparison: comparisons(f)[0], value: "", transform: undefined })
        }
      />
      {field?.kind === "date" && !importedTransform && (
        <Pick
          items={[
            { value: "date", label: "Date" },
            { value: "age", label: "Age in years" },
          ]}
          value={c.transform === "yearsSince" ? "age" : "date"}
          label="Compare"
          placeholder="Compare"
          onChange={(mode) =>
            update(
              () =>
                handlers.update({ ...conditionMode(c, mode === "age"), valueIsLiteral: undefined }),
              { tag: [SKIP_DOM_SELECTION_TAG, HISTORY_PUSH_TAG] },
            )
          }
        />
      )}
      {!importedTransform && (
        <Pick
          items={comparisons(field, c.transform === "yearsSince" ? "yearsSince" : undefined).map(
            (k) => ({ value: k, label: comparisonLabel(k) }),
          )}
          value={comparison}
          placeholder=""
          label="Select operator"
          onChange={(k) => set({ comparison: k })}
        />
      )}
      {importedTransform ? (
        <span className="flex items-center gap-2 text-12">
          <span>
            Imported: {c.transform} {c.comparison && comparisonLabel(c.comparison)}{" "}
            {JSON.stringify(c.value)}
          </span>
          <Button
            size="sm"
            onClick={() =>
              set({ transform: undefined, comparison: comparisons(field)[0], value: "" })
            }
          >
            Change comparison
          </Button>
        </span>
      ) : c.valueIsLiteral ? (
        <span className="flex items-center gap-2 text-12">
          <span>Imported value: {JSON.stringify(c.value)}</span>
          <Button size="sm" onClick={() => set({ value: "" })}>
            Change value
          </Button>
        </span>
      ) : (
        value
      )}
      <ConditionMenu handlers={handlers} />
    </div>
  );
}

export function ActionRow({
  action: a,
  count,
  ctx,
  onChange,
  onAdd,
  onRemove,
  onDuplicate,
}: {
  action: Action;
  index: number;
  count: number;
  ctx: LogicContext;
  onChange: (a: Action) => void;
  onAdd: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const update = useEditableUpdate();
  // Retain the payload when switching action types so switching back can recover it.
  const actionTypes = formDefinition(useEditorDefinition()).logicActions;

  const setPayload = (payload: Omit<Action, "id" | "type">) =>
    onChange({ id: a.id, type: a.type, ...payload });

  const unavailable = !!a.type && !actionTypes.some((action) => action.type === a.type);
  const calculated = ctx.fields.filter((f) => f.type === "CALCULATED_FIELD");
  let payload: ReactNode = null;

  if (unavailable)
    payload = (
      <span role="status" className="max-w-80 text-12 text-muted">
        This saved action is unavailable in this editor. Its settings are kept.
      </span>
    );
  else if (a.type === "JUMP_TO_PAGE") {
    const pages = ctx.pages.some((p) => p.confirmation)
      ? ctx.pages
      : [...ctx.pages, { id: "0", label: "Default confirmation page", confirmation: true }];

    payload = (
      <Pick
        items={pages.map((p) => ({
          value: p.id,
          label: p.label,
          icon: p.confirmation ? <Smiley /> : <File />,
        }))}
        value={a.jumpToPage}
        placeholder="Select page"
        onChange={(jumpToPage) => setPayload({ jumpToPage })}
      />
    );
  } else if (a.type === "REQUIRE_ANSWER")
    payload = (
      <FieldCombobox
        groups={typeGroups(ctx.inputs)}
        value={a.requireAnswer}
        placeholder="Select an input field"
        onSelect={(f) => setPayload({ requireAnswer: f.key })}
      />
    );
  else if (a.type === "SHOW_BLOCKS" || a.type === "HIDE_BLOCKS") {
    const key = a.type === "SHOW_BLOCKS" ? "showBlocks" : "hideBlocks";
    payload = (
      <BlocksPick
        tree={ctx.tree}
        value={a[key] ?? []}
        page={ctx.page}
        onChange={(ids) => setPayload({ [key]: ids })}
      />
    );
  } else if (a.type === "CHANGE_LABEL" || a.type === "CHANGE_PAGE_TITLE") {
    const pageTitle = a.type === "CHANGE_PAGE_TITLE";
    const key = pageTitle ? "changePageTitle" : "changeLabel";
    const change = a[key] ?? {};
    payload = (
      <>
        {pageTitle ? (
          <Pick
            items={ctx.pages.map((page) => ({ value: page.id, label: page.label, icon: <File /> }))}
            value={change.target}
            label="Page whose heading changes"
            placeholder="Select page"
            onChange={(target) => setPayload({ [key]: { ...change, target } })}
          />
        ) : (
          <FieldCombobox
            groups={typeGroups(ctx.inputs)}
            value={change.target}
            placeholder="Question whose label changes"
            onSelect={(field) => setPayload({ [key]: { ...change, target: field.key } })}
          />
        )}
        <input
          aria-label={pageTitle ? "Replacement page heading" : "Replacement question label"}
          placeholder={pageTitle ? "New page heading" : "New question label"}
          value={change.text ?? ""}
          onChange={(event) => setPayload({ [key]: { ...change, text: event.target.value } })}
          className="h-8 w-64 rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none placeholder:text-placeholder focus:shadow-input-focus"
        />
      </>
    );
  } else if (a.type === "CALCULATE") {
    const c = a.calculate ?? {};
    const field = calculated.find((f) => f.key === c.field);
    // Keep missing references selected so authors can identify and repair them.
    const picked = !!field || !!c.field;
    const kind = field?.kind === "TEXT" ? "TEXT" : "NUMBER";
    payload = !calculated.length ? (
      // Insert above the logic block so the calculated field is available to its conditions.
      <Button
        icon={<Plus />}
        onClick={() =>
          update(
            () => $getNodeByKey(ctx.nodeKey)?.insertBefore($createWidgetNode("calculated-fields")),
            { tag: SKIP_DOM_SELECTION_TAG },
          )
        }
      >
        Add calculated field
      </Button>
    ) : (
      <>
        <FieldCombobox
          groups={typeGroups(calculated)}
          value={c.field}
          placeholder="Select field"
          onSelect={(f) => setPayload({ calculate: { ...c, field: f.key } })}
        />
        {picked && (
          <Pick
            items={operatorsFor(kind).map(([op, label, Icon]) => ({
              value: op,
              label,
              icon: <Icon />,
            }))}
            value={c.operator}
            placeholder=""
            label="Select operator"
            iconOnly
            onChange={(op) => {
              // A new operator drops the formula
              const rest = { ...c };
              delete rest.expression;
              setPayload({ calculate: { ...rest, operator: op } });
            }}
          />
        )}
        {picked && c.operator === "FORMULA" && (
          <FormulaPill
            expression={c.expression ?? ""}
            fields={ctx.fields}
            type={kind}
            onChange={(expression) => setPayload({ calculate: { ...c, expression } })}
          />
        )}
        {!picked && c.operator === "FORMULA" && c.expression && (
          <Tip content="Formulas are read-only for now">
            <span aria-label="Formulas are read-only for now" className={pill}>
              <span className={pillValue}>{formulaOf(c.expression, ctx.fields)}</span>
            </span>
          </Tip>
        )}
        {picked && c.operator && c.operator !== "FORMULA" && (
          <ValuePick
            key={c.field}
            groups={ctx.groups}
            value={c.value}
            number={kind === "NUMBER"}
            placeholder="Value"
            onChange={(value) => setPayload({ calculate: { ...c, value } })}
          />
        )}
      </>
    );
  }

  return (
    <div className={row} data-logic-action={a.type ?? ""}>
      <Pick
        items={actionTypes.map(({ type, label, icon }) => ({ value: type, label, icon }))}
        value={a.type}
        placeholder={
          unavailable
            ? `${a.type!.toLowerCase().replaceAll("_", " ")} (unavailable)`
            : "Select action"
        }
        label="Select action"
        onChange={(type) => onChange({ ...a, type: type })}
      />
      {payload}
      <More
        label="Add, remove, and more..."
        items={[
          ["Add action", Plus, onAdd],
          count > 1 && ["Remove", Trash, onRemove],
          ["Duplicate", Copy, onDuplicate],
        ]}
      />
    </div>
  );
}

export type LogicContext = {
  nodeKey: NodeKey;
  fields: Field[];
  groups: FieldGroup[];
  inputs: Field[];
  pages: Page[];
  tree: TreeNode[];
  page: number;
};

/**
 * "When" conditions and "Then" actions preserve unfinished rules and missing references for repair.
 */
export function ConditionalLogic({ nodeKey, settings }: WidgetProps) {
  const native = useRead(() => {
    const node = $getNodeByKey(nodeKey);

    return node ? ($native(node).logic ?? null) : null;
  });

  return native ? (
    <NativeConditionalLogic nodeKey={nodeKey} block={native} />
  ) : (
    <LegacyConditionalLogic nodeKey={nodeKey} settings={settings} />
  );
}

function LegacyConditionalLogic({ nodeKey, settings }: WidgetProps) {
  const update = useEditableUpdate();
  const set = useSetSettings(nodeKey);

  const read = useRead(() => {
    const node = $getNodeByKey(nodeKey);

    return {
      fields: $fields({ raw: true }),
      above: $fields({ before: node, raw: true }),
      inputs: $fields({ raw: true }).filter((f) => f.type === "INPUT_FIELD"),
      pages: $pages().map(({ id, label, confirmation }) => ({ id, label, confirmation })),
      tree: $blockTree(),
      showNeedsHidden:
        !!node && $showTargetBlocks($logicActions(node)).some((block) => !$settings(block).hidden),
      // The logic block's page, for what the blocks tree opens with
      page: node ? node.getPreviousSiblings().filter($isPageBreak).length : 0,
    };
  });

  const groups = useMemo(() => pickerGroups(read.fields), [read.fields]);
  const ctx: LogicContext = { nodeKey, ...read, groups };
  const logic = conditionalLogic(settings);

  // Only the keys given: $setSettings drops a key set to undefined
  const patch = (next: Partial<typeof logic>) =>
    Object.fromEntries(Object.entries(next).map(([key, value]) => [key, json(value)]));

  const save = (next: Partial<typeof logic>) => set(patch(next));
  const actions = logic.actions;

  const saveActions = (next: Action[]) =>
    update(
      () => {
        const node = $getNodeByKey(nodeKey);

        if (node) $setLogicActions(node, next);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );

  return (
    <div className={surface} data-logic-block="" tabIndex={-1}>
      <Caption icon={<ArrowsSplit />}>Conditional logic</Caption>
      <Scroll root>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className={header}>
              When
              <Match
                conditionals={logic.conditionals}
                value={logic.logicalOperator}
                onChange={(logicalOperator) => save({ logicalOperator })}
              />
            </div>
            <Conditions
              list={logic.conditionals}
              operator={logic.logicalOperator}
              within={false}
              onChange={(conditionals) => save({ conditionals })}
              ctx={ctx}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className={header}>Then</div>
            {actions.map((a, i) => (
              <ActionRow
                key={a.id}
                action={a}
                index={i}
                count={actions.length}
                ctx={ctx}
                onChange={(next) => saveActions(actions.map((b, j) => (j === i ? next : b)))}
                onAdd={() =>
                  saveActions([
                    ...actions.slice(0, i + 1),
                    { id: newId() },
                    ...actions.slice(i + 1),
                  ])
                }
                onRemove={() => saveActions(actions.filter((_, j) => j !== i))}
                onDuplicate={() =>
                  saveActions([
                    ...actions.slice(0, i + 1),
                    { ...a, id: newId() },
                    ...actions.slice(i + 1),
                  ])
                }
              />
            ))}
          </div>
        </div>
      </Scroll>
      {actions.some(
        (action) => action.type === "CHANGE_LABEL" || action.type === "CHANGE_PAGE_TITLE",
      ) && (
        <p className="mt-1 text-12 leading-5 text-muted">
          The first matching wording rule is used. Otherwise, the text written on the form is used.
        </p>
      )}
      {actions.some((action) => action.type === "SHOW_BLOCKS") && (
        <div className="mt-1 text-12 leading-5 text-muted">
          <p>New Show targets start hidden and appear when this rule matches.</p>
          {read.showNeedsHidden && (
            <p>
              Some Show targets are visible initially.{" "}
              <Button
                size="sm"
                onClick={() =>
                  update(
                    () => {
                      const node = $getNodeByKey(nodeKey);

                      if (node) $hideShowTargets(node);
                    },
                    { tag: SKIP_DOM_SELECTION_TAG },
                  )
                }
              >
                Hide targets initially
              </Button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
