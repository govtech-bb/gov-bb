import { useEditorDefinition } from "../../../editor/react/composer";
import { PencilSimpleLine, Trash } from "@phosphor-icons/react";
import type { BlockMenuActions, BlockMenuModel } from "../../react/block-settings";
import { toSettings } from "../../core/repetition";
import {
  Action,
  AnswerMoreThanOnce,
  ErrorMessages,
  InternalAlias,
  SubmenuRow,
  Switch,
} from "../../react/settings-controls";

export type FieldControlsProps = { m: BlockMenuModel; a: BlockMenuActions };

export function InputStatus({ m }: Pick<FieldControlsProps, "m">) {
  return (
    <>
      {m.header && <Switch label="Required" on="required" />}
      {m.header && m.fieldId?.id !== "declaration-confirmed" && (
        <Switch label="Disabled" on="isDisabled" />
      )}
    </>
  );
}

export function InputHints({ m, a }: FieldControlsProps) {
  return (
    <>
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
    </>
  );
}

export function RepeatAnswer({ m, a }: FieldControlsProps) {
  const definition = useEditorDefinition();

  return (
    definition.capabilities.includes("form-repetition") &&
    m.fieldArray && (
      <AnswerMoreThanOnce
        {...m.fieldArray}
        onChange={(next) => a.onSettings({ fieldArray: toSettings(next) })}
      />
    )
  );
}

export function InputEnd({ m, a }: FieldControlsProps) {
  return (
    <>
      {m.header && <ErrorMessages errors={m.errors} onChange={a.onErrorMessage} />}
      {m.header && (
        <SubmenuRow label="Advanced">
          <InternalAlias />
        </SubmenuRow>
      )}
    </>
  );
}
