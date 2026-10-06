import { formDefinition } from "../definition";
import { useEditorDefinition } from "../../editor/react/composer";
import { Menu } from "@base-ui/react/menu";
import { Store, SsbField, SubmenuRow, Action } from "../react/settings-controls";

export { BoundsFields, SsbField } from "../react/settings-controls";

import { EditorSlot } from "../../editor/react/contributions";
import {
  ArrowElbowDownRight,
  ArrowsSplit,
  Check,
  Copy,
  Eye,
  EyeSlash,
  ListPlus,
  Swap,
  TextOutdent,
  Trash,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { ItemLabel, Shortcut, item } from "../../ui/item";
import { check, list, option } from "../../ui/select";
import type { Settings } from "../core/settings";
import { presetProvenance } from "../core/provenance";
import { checkId } from "../editor/ssb";

const group = "not-last:mb-1.5 not-last:border-b not-last:border-line not-last:pb-1.5";

export type { BlockMenuModel, BlockMenuActions } from "../react/block-settings";

import type { BlockMenuModel, BlockMenuActions } from "../react/block-settings";

export function BlockMenu({
  model: m,
  actions: a,
  finalFocus,
}: {
  model: BlockMenuModel;
  actions: BlockMenuActions;
  finalFocus?: () => boolean;
}) {
  const definition = formDefinition(useEditorDefinition());
  const field = m.header ? definition.fields.find((field) => field.kind === m.kind) : undefined;

  return (
    <Menu.Portal>
      <Menu.Positioner side="left" align="start" sideOffset={4} className="z-50 outline-none">
        <Menu.Popup
          finalFocus={finalFocus}
          className="max-h-(--available-height) w-75 max-w-175 overflow-y-auto rounded-sm bg-white py-1.5 font-sans shadow-popup outline-none transition-opacity duration-180 ease-out-cubic data-ending-style:opacity-0 data-starting-style:opacity-0 max-md:max-w-[min(700px,calc(100vw-50px))] max-sm:max-w-[min(700px,calc(50vw-10px))]"
        >
          {!m.header && !m.multi && m.fieldId && (
            <div className={group}>
              <SsbField
                label="Field ID"
                value={m.fieldId.id}
                pinned={m.fieldId.pinned}
                fixed={m.fieldId.fixed}
                clash={m.fieldId.clash}
                validate={(id) => checkId(id, new Set(m.fieldId!.taken), undefined, "block")}
                onChange={a.onFieldId}
                mono
                inline
              />
            </div>
          )}
          {m.header && !m.multi && (
            <div className={group}>
              <Header {...m.header} />
              {m.fieldId && (
                <SsbField
                  label="Field ID"
                  value={m.fieldId.id}
                  pinned={m.fieldId.pinned}
                  fixed={m.fieldId.fixed}
                  clash={m.fieldId.clash}
                  validate={(id) => checkId(id, new Set(m.fieldId!.taken))}
                  onChange={a.onFieldId}
                  mono
                  inline
                />
              )}
              <TeamField settings={m.settings} />
            </div>
          )}
          {!m.multi && (
            <Store settings={m.settings} set={a.onSettings}>
              <EditorSlot name="form.block-settings" props={{ m, a }} />
            </Store>
          )}
          <Menu.Group className={group}>
            <Action icon={<Trash />} shortcut="Del" onClick={a.onDelete}>
              Delete
            </Action>
            <Action icon={<Copy />} shortcut="⌘ D" onClick={a.onDuplicate}>
              Duplicate
            </Action>
            {m.hidden !== undefined && (
              <Action icon={m.hidden ? <Eye /> : <EyeSlash />} shortcut="⌘ ⇧ H" onClick={a.onHide}>
                {`${m.hidden ? "Show" : "Hide"}${m.multi ? " blocks" : ""}`}
              </Action>
            )}
            {!m.multi &&
              m.header &&
              definition.contents.some(
                (content) => content.source.storage.value === "conditional-logic",
              ) && (
                <Action icon={<ArrowsSplit />} shortcut="⌘ ⇧ L" onClick={a.onAddLogic}>
                  Add conditional logic
                </Action>
              )}
            {!m.multi && m.followUp && (
              <Action icon={<ArrowElbowDownRight />} shortcut="⌥ ↵" onClick={a.onAddFollowUp}>
                Add follow-up
              </Action>
            )}
            {!m.multi && m.nested && (
              <Action icon={<TextOutdent />} shortcut={`‘${m.nested.host}’`} onClick={a.onMoveOut}>
                Move out
              </Action>
            )}
            {!m.multi && field?.source.choice && (
              <Action icon={<ListPlus />} shortcut="⌘ ⇧ O" onClick={a.onBulkInsert}>
                Bulk insert options
              </Action>
            )}
            {!m.multi && m.turnInto && <TurnInto {...m.turnInto} onValueChange={a.onTurnInto} />}
          </Menu.Group>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function FixedRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cn(item, "cursor-default")}>
      <ItemLabel>{label}</ItemLabel>
      <Shortcut>{value}</Shortcut>
    </div>
  );
}

function TeamField({ settings }: { settings: Settings }) {
  const component = presetProvenance(settings);

  if (!component) return null;

  return (
    <>
      <FixedRow label="Based on" value={component.name} />
      <p className="px-3.5 pb-1.5 text-12 text-muted">
        An editable copy. Changes stay in this form.
      </p>
    </>
  );
}

function Header({ name, icon }: NonNullable<BlockMenuModel["header"]>) {
  return (
    <div
      title={name}
      className="mx-1 flex min-h-8 items-center gap-2.5 px-2.5 text-14 leading-4 font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted"
    >
      {icon}
      <span className="min-w-0 truncate">{name}</span>
    </div>
  );
}

function TurnInto({
  value,
  options,
  onValueChange,
}: NonNullable<BlockMenuModel["turnInto"]> & { onValueChange: (kind: string) => void }) {
  return (
    <SubmenuRow
      label="Turn into"
      icon={<Swap />}
      text={options.find(([kind]) => kind === value)?.[1]}
    >
      <Menu.RadioGroup value={value} onValueChange={onValueChange} className={list}>
        {options.map(([kind, label, icon]) => (
          <Menu.RadioItem
            key={kind}
            value={kind}
            closeOnClick
            className={cn(option, "[&>svg]:size-4")}
          >
            {icon}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Menu.RadioItemIndicator className={check}>
              <Check />
            </Menu.RadioItemIndicator>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </SubmenuRow>
  );
}
