import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import type { OptionGroup } from "@govtech-bb/form-types";
import { OptionsEditor } from "./options-editor";

interface OptionGroupsEditorProps {
  value: OptionGroup[];
  defaultValue: OptionGroup[];
  isOverridden: boolean;
  onChange: (next: OptionGroup[] | undefined) => void;
}

// The categories of a checkbox-accordion field (#2887): one row per group
// with its label, Higher-risk flag, move/remove buttons and a nested
// OptionsEditor for its items. Same contract as OptionsEditor: rows come from
// the override when set, else the base primitive; every edit emits the whole
// array; Reset drops the override.
export function OptionGroupsEditor({
  value,
  defaultValue,
  isOverridden,
  onChange,
}: OptionGroupsEditorProps) {
  const rows = isOverridden ? value : defaultValue;

  function emit(next: OptionGroup[]) {
    onChange(next);
  }

  function update(index: number, patch: Partial<OptionGroup>) {
    emit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function toggleHigherRisk(index: number, checked: boolean) {
    emit(
      rows.map((row, i) => {
        if (i !== index) return row;
        if (checked) return { ...row, higherRisk: true };
        const { higherRisk: _higherRisk, ...rest } = row;
        return rest;
      }),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next);
  }

  function remove(index: number) {
    emit(rows.filter((_, i) => i !== index));
  }

  function add() {
    emit([...rows, { label: "", options: [] }]);
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((group, i) => (
        <fieldset
          key={i}
          className="flex flex-col gap-1.5 rounded border border-ui-hairline p-3"
        >
          <legend className="sr-only">Category {i + 1}</legend>
          <div className="flex flex-wrap items-center gap-1.5 [&_input[type=text]]:min-w-0 [&_input[type=text]]:flex-[1_1_8rem]">
            <Input
              type="text"
              aria-label="Category label"
              placeholder="Category"
              value={group.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="w-full min-w-0"
            />
            <div className="inline-flex items-center gap-1 whitespace-nowrap">
              <Checkbox
                checked={group.higherRisk ?? false}
                onCheckedChange={(nextChecked) => {
                  toggleHigherRisk(i, nextChecked);
                }}
                label={<> Higher-risk</>}
              />
            </div>
            <Button
              type="button"
              aria-label="Move category up"
              title="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              variant="secondary"
              size="sm"
            >
              ↑
            </Button>
            <Button
              type="button"
              aria-label="Move category down"
              title="Move down"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              variant="secondary"
              size="sm"
            >
              ↓
            </Button>
            <Button
              type="button"
              aria-label="Remove category"
              title="Remove category"
              onClick={() => remove(i)}
              variant="secondary"
              size="sm"
            >
              ×
            </Button>
          </div>
          {/* The nested editor edits this category's own list: rows are the
              group's options and every edit emits the full array, so it is
              shown as "not overridden" — there is no per-category default to
              reset to. */}
          <OptionsEditor
            value={group.options}
            defaultValue={group.options}
            isOverridden={false}
            onChange={(options) => update(i, { options: options ?? [] })}
          />
        </fieldset>
      ))}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button type="button" onClick={add} variant="secondary" size="sm">
          Add category
        </Button>
        {isOverridden && (
          <Button
            type="button"
            onClick={() => onChange(undefined)}
            variant="secondary"
            size="sm"
          >
            Reset to defaults
          </Button>
        )}
      </div>
    </div>
  );
}
