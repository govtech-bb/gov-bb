import { Button } from "../../component/ui/button";
import { Checkbox } from "../../component/ui/checkbox";
import { Input } from "../../component/ui/input";
import type { Option } from "@govtech-bb/form-types";
import styles from "../../styles/builder.module.css";

interface OptionsEditorProps {
  value: Option[];
  defaultValue: Option[];
  isOverridden: boolean;
  onChange: (next: Option[] | undefined) => void;
}

export function OptionsEditor({
  value,
  defaultValue,
  isOverridden,
  onChange,
}: OptionsEditorProps) {
  const rows = isOverridden ? value : defaultValue;

  function emit(next: Option[]) {
    onChange(next);
  }

  function update(index: number, patch: Partial<Option>) {
    emit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function toggleDisabled(index: number, checked: boolean) {
    emit(
      rows.map((row, i) => {
        if (i !== index) return row;
        if (checked) return { ...row, disabled: true };
        const { disabled: _disabled, ...rest } = row;
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
    emit([...rows, { label: "", value: "" }]);
  }

  return (
    <div className={styles.optionsEditor}>
      {rows.map((row, i) => (
        <div key={i} className={styles.optionsRow}>
          <Input
            type="text"
            aria-label="Option label"
            placeholder="Label"
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className="w-full min-w-0"
          />
          <Input
            type="text"
            aria-label="Option value"
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="w-full min-w-0"
          />
          <div className={styles.optionsDisabled}>
            <Checkbox
              checked={row.disabled ?? false}
              onCheckedChange={(nextChecked) => {
                toggleDisabled(i, nextChecked);
              }}
              label={<> Disabled</>}
            />
          </div>
          <Button
            type="button"
            aria-label="Move option up"
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
            aria-label="Move option down"
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
            aria-label="Remove option"
            title="Remove option"
            onClick={() => remove(i)}
            variant="secondary"
            size="sm"
          >
            ×
          </Button>
        </div>
      ))}
      <div className={styles.optionsActions}>
        <Button type="button" onClick={add} variant="secondary" size="sm">
          Add option
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
