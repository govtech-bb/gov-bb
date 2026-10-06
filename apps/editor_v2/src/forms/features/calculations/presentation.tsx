import { calculatedFields, type CalculatedField } from "../../core/logic";
import { $getNodeByKey } from "lexical";
import { Plus, Sigma, Trash } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "../../../ui/button";
import { PillInput, pill, pillIcon } from "../../../ui/pill";
import { type Setting } from "../../editor/nodes";
import { useSetSettings, type WidgetProps } from "../../react/widget-settings";
import { $fields } from "../logic/queries";
import { useRead } from "../../react/logic-hooks";
import {
  typeGroups,
  surface,
  Caption,
  row,
  Scroll,
  More,
  focusPillInput,
  focusInput,
  Pick,
  ValuePick,
} from "../../react/logic-pickers";
import { $native } from "../../editor/native-state";
import { NativeCalculatedField } from "./native-presentation";

export const json = (value: Setting) => value;

export const newId = () => crypto.randomUUID();

export function CalculatedFields({ nodeKey, settings }: WidgetProps) {
  const native = useRead(() => {
    const node = $getNodeByKey(nodeKey);

    return node ? ($native(node).calculated ?? null) : null;
  });

  return native ? (
    <NativeCalculatedField nodeKey={nodeKey} block={native} />
  ) : (
    <LegacyCalculatedFields nodeKey={nodeKey} settings={settings} />
  );
}

function LegacyCalculatedFields({ nodeKey, settings }: WidgetProps) {
  const set = useSetSettings(nodeKey);
  const fields = calculatedFields(settings);
  // The initial value takes the fields above, plus hidden fields
  const above = useRead(() => $fields({ before: $getNodeByKey(nodeKey), raw: true }));
  const groups = useMemo(() => typeGroups(above), [above]);

  const save = (next: CalculatedField[]) =>
    set({ calculatedFields: json(next), name: undefined, fieldType: undefined, value: undefined });

  const update = (i: number, patch: Partial<CalculatedField>) =>
    save(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className={surface}>
      <Caption icon={<Sigma />}>Calculated fields</Caption>
      <Scroll>
        <div className="flex flex-col gap-1">
          {fields.map((f, i) => (
            <div key={f.id} className={row}>
              <span
                ref={f.name ? undefined : focusInput}
                onMouseDown={focusPillInput}
                className={pill}
              >
                <span className={pillIcon}>
                  <Sigma />
                </span>
                <PillInput
                  placeholder="Field name"
                  value={f.name ?? ""}
                  onChange={(name) => update(i, { name })}
                />
              </span>
              <Pick
                items={[
                  { value: "NUMBER", label: "Number" },
                  { value: "TEXT", label: "Text" },
                ]}
                value={f.type}
                placeholder="Select type"
                onChange={(type) =>
                  (type === "NUMBER" || type === "TEXT") &&
                  update(i, { type, value: f.value ?? "" })
                }
              />
              {f.value !== undefined && (
                <>
                  <span className="text-14 font-semibold text-muted">=</span>
                  <ValuePick
                    groups={groups}
                    value={f.value}
                    number={f.type === "NUMBER"}
                    placeholder="Initial value"
                    emptyText="No search results"
                    onChange={(value) => update(i, { value: value ?? "" })}
                  />
                </>
              )}
              <More
                label="Add and remove"
                items={[
                  [
                    "Add calculated field",
                    Plus,
                    () =>
                      save([...fields.slice(0, i + 1), { id: newId() }, ...fields.slice(i + 1)]),
                  ],
                  ["Remove", Trash, () => save(fields.filter((_, j) => j !== i))],
                ]}
              />
            </div>
          ))}
          {/* Keep an add action available after every calculated field has been removed. */}
          {!fields.length && (
            <div className={row}>
              <Button icon={<Plus />} onClick={() => save([{ id: newId() }])}>
                Add calculated field
              </Button>
            </div>
          )}
        </div>
      </Scroll>
    </div>
  );
}
