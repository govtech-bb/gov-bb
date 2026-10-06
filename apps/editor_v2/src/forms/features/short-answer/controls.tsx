import { PencilSimpleLine, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { BlockMenuActions, BlockMenuModel } from "../../react/block-settings";
import { toSettings } from "../../core/repetition";
import { FIELD_WIDTHS, patternWorks } from "../../core/field-settings";
import { formatOf } from "../../core/formats";
import {
  Action,
  AnswerMoreThanOnce,
  ErrorMessages,
  Field,
  InternalAlias,
  Label,
  Pick,
  SettingsGroup,
  SubmenuRow,
  Switch,
  useStore,
} from "../../react/settings-controls";

export function ShortAnswerControls({ m, a }: { m: BlockMenuModel; a: BlockMenuActions }) {
  const input = !!m.header;

  return (
    <SettingsGroup>
      {input && <Switch label="Required" on="required" />}
      {input && m.fieldId?.id !== "declaration-confirmed" && (
        <Switch label="Disabled" on="isDisabled" />
      )}
      {m.hint !== undefined && (
        <Action icon={<PencilSimpleLine />} onClick={a.onEditHint}>
          {m.hint ? "Edit hint text" : "Add hint text"}
        </Action>
      )}
      {m.hint && (
        <Action icon={<Trash />} onClick={a.onRemoveHint}>
          Remove hint text
        </Action>
      )}
      {m.hint !== undefined && <Switch label="Hide question label" on="hideLabel" />}
      {input && (
        <Switch label="Default answer" on="hasDefaultAnswer" value="defaultAnswer" type="text" />
      )}
      <Switch label="Min characters" on="hasMinCharacters" value="minCharacters" type="number" />
      <Switch label="Max characters" on="hasMaxCharacters" value="maxCharacters" type="number" />
      {m.fieldArray && (
        <AnswerMoreThanOnce
          {...m.fieldArray}
          onChange={(next) => a.onSettings({ fieldArray: toSettings(next) })}
        />
      )}
      {input && <Pick label="Field width" value="width" options={FIELD_WIDTHS} fallback={"long"} />}
      <TextFormat />
      {input && <ErrorMessages errors={m.errors} onChange={a.onErrorMessage} />}
      {input && (
        <SubmenuRow label="Advanced">
          <InternalAlias />
        </SubmenuRow>
      )}
    </SettingsGroup>
  );
}

function TextFormat() {
  const { settings, set } = useStore();
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const pattern = draft ?? String(settings.pattern ?? "");
  const invalid = !!pattern && !patternWorks(pattern);

  const summary =
    formatOf(settings)?.name ??
    (settings.pattern ? "Custom" : settings.mask ? "Input mask" : "None");

  return (
    <SubmenuRow label="Format" text={summary} className="w-90 max-w-[calc(100vw-32px)]">
      <Label>
        <label htmlFor={`${id}-pattern`}>Validation pattern</label>
      </Label>
      <Field
        id={`${id}-pattern`}
        value={pattern}
        controlled
        className="font-mono"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={invalid}
        aria-describedby={`${id}-pattern-help${invalid ? ` ${id}-pattern-error` : ""}`}
        onChange={(next) => {
          setDraft(next);

          if (!next || patternWorks(next)) set({ pattern: next || undefined });
        }}
        onBlur={() => setDraft(null)}
      />
      <p id={`${id}-pattern-help`} className="px-3.5 pb-1.5 text-12 text-muted">
        Regular expression, without surrounding slashes. Clear to remove the validation rule.
      </p>
      {invalid && (
        <p id={`${id}-pattern-error`} className="px-3.5 pb-1.5 text-12 text-error">
          Enter a valid regular expression, or clear the pattern. The last valid pattern is still
          applied.
        </p>
      )}
      <Label>
        <label htmlFor={`${id}-mask`}>Input mask</label>
      </Label>
      <Field
        id={`${id}-mask`}
        value={settings.mask}
        controlled
        className="font-mono"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={`${id}-mask-help`}
        onChange={(next) => set({ mask: next || undefined })}
      />
      <p id={`${id}-mask-help`} className="px-3.5 pb-2 text-12 text-muted">
        Use 9 for a digit, A for a letter and * for either. Other characters stay fixed. Clear to
        remove the mask.
      </p>
    </SubmenuRow>
  );
}
