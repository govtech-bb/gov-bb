import { Menu } from "@base-ui/react/menu";
import { Check, PencilSimpleLine, Trash } from "@phosphor-icons/react";
import type { BlockMenuActions, BlockMenuModel } from "../../react/block-settings";
import { toSettings } from "../../core/repetition";
import { FILE_TYPES, fileTypesOf } from "./files";
import { check, list, option } from "../../../ui/select";
import {
  Action,
  AnswerMoreThanOnce,
  ErrorMessages,
  InternalAlias,
  SettingsGroup,
  SubmenuRow,
  Switch,
  Toggle,
  useStore,
} from "../../react/settings-controls";

type Options = [value: string, label: string][];

export function FileUploadControls({ m, a }: { m: BlockMenuModel; a: BlockMenuActions }) {
  const input = !!m.header,
    s = m.settings;

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
      {m.fieldArray && (
        <AnswerMoreThanOnce
          {...m.fieldArray}
          onChange={(next) => a.onSettings({ fieldArray: toSettings(next) })}
        />
      )}
      <Toggle
        checked={!!s.hasMultipleFiles}
        onCheckedChange={(on) =>
          a.onSettings({
            hasMultipleFiles: on,
            hasMinFiles: undefined,
            hasMaxFiles: undefined,
            minFiles: undefined,
            maxFiles: undefined,
          })
        }
      >
        Multiple files
      </Toggle>
      {(s.hasMultipleFiles || s.hasMinFiles) && (
        <Switch label="Min files" on="hasMinFiles" value="minFiles" type="number" />
      )}
      {(s.hasMultipleFiles || s.hasMaxFiles) && (
        <Switch label="Max files" on="hasMaxFiles" value="maxFiles" type="number" />
      )}
      <Switch label="Max file size (MB)" on="hasMaxFileSize" value="maxFileSize" type="number" />
      <Choice
        label="Allowed files"
        value="allowedFiles"
        options={FILE_TYPES.map(([mime, name]) => [mime, name])}
      />
      {input && <ErrorMessages errors={m.errors} onChange={a.onErrorMessage} />}
      {input && (
        <SubmenuRow label="Advanced">
          <InternalAlias />
        </SubmenuRow>
      )}
    </SettingsGroup>
  );
}

function Choice({ label, value, options }: { label: string; value: string; options: Options }) {
  const { settings, set } = useStore();
  const chosen = fileTypesOf(settings);

  const text = chosen
    .map((v) => options.find(([key]) => key === v)?.[1])
    .filter(Boolean)
    .join(", ");

  return (
    <SubmenuRow label={label} text={text}>
      <div className={list}>
        {options.map(([key, name]) => (
          <Menu.CheckboxItem
            key={key}
            checked={chosen.includes(key)}
            disabled={chosen.length === 1 && chosen.includes(key)}
            onCheckedChange={(on) => {
              const next = on ? [...chosen, key] : chosen.filter((v) => v !== key);
              set({ [value]: next.length ? next : undefined });
            }}
            className={option}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <Menu.CheckboxItemIndicator className={check}>
              <Check />
            </Menu.CheckboxItemIndicator>
          </Menu.CheckboxItem>
        ))}
      </div>
    </SubmenuRow>
  );
}
