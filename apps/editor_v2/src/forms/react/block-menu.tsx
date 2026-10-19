import { formDefinition } from "../definition";
import { useEditorDefinition } from "../../editor/react/composer";
import { Store, SsbField, Action } from "../react/settings-controls";

export { BoundsFields, SsbField } from "../react/settings-controls";

import { EditorSlot } from "../../editor/react/contributions";
import { shortcut } from "../../editor/react/shortcut";
import {
  ArrowElbowDownRight,
  ArrowsSplit,
  Copy,
  Eye,
  EyeSlash,
  ListPlus,
  TextOutdent,
  Trash,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { Menu, RowContent } from "../../ui/menu";
import { TurnIntoSubmenu } from "../../ui/turn-into";
import { group, row } from "../../ui/surface";
import type { Settings } from "../core/settings";
import { presetProvenance } from "../core/provenance";
import { checkId } from "../editor/ssb";
import { textBlockKeys } from "../editor/turn-into";

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
    // Beside the grip, so it never covers the block it acts on; on a phone it takes at most half the width
    <Menu.Content
      aria-label="Block actions"
      side="left"
      sideOffset={4}
      finalFocus={finalFocus}
      className="w-75 max-sm:max-w-[calc(50vw-10px)]"
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
      <Menu.Group>
        <Action icon={<Trash />} shortcut={shortcut(["delete"])} onClick={a.onDelete}>
          Delete
        </Action>
        <Action icon={<Copy />} shortcut={shortcut(["mod", "d"])} onClick={a.onDuplicate}>
          Duplicate
        </Action>
        {m.hidden !== undefined && (
          <Action
            icon={m.hidden ? <Eye /> : <EyeSlash />}
            shortcut={shortcut(["mod", "shift", "h"])}
            onClick={a.onHide}
          >
            {`${m.hidden ? "Show" : "Hide"}${m.multi ? " blocks" : ""}`}
          </Action>
        )}
        {!m.multi &&
          m.header &&
          definition.contents.some(
            (content) => content.source.storage.value === "conditional-logic",
          ) && (
            <Action
              icon={<ArrowsSplit />}
              shortcut={shortcut(["mod", "shift", "l"])}
              onClick={a.onAddLogic}
            >
              Add conditional logic
            </Action>
          )}
        {!m.multi && m.followUp && (
          <Action
            icon={<ArrowElbowDownRight />}
            shortcut={shortcut(["alt", "enter"])}
            onClick={a.onAddFollowUp}
          >
            Add follow-up
          </Action>
        )}
        {!m.multi && m.nested && (
          // Where the block moves out of: the question it's nested under, not a key
          <Menu.Item icon={<TextOutdent />} detail={`‘${m.nested.host}’`} onClick={a.onMoveOut}>
            Move out
          </Menu.Item>
        )}
        {!m.multi && field?.source.choice && (
          <Action
            icon={<ListPlus />}
            shortcut={shortcut(["mod", "shift", "o"])}
            onClick={a.onBulkInsert}
          >
            Bulk insert options
          </Action>
        )}
        {!m.multi && m.turnInto && (
          <TurnIntoSubmenu
            value={m.turnInto.value}
            options={m.turnInto.options.map(([kind, label, icon]) => {
              // A text block's types have shortcuts; a question's answers don't
              const keys = !m.header && textBlockKeys.get(kind);

              return { value: kind, label, icon, shortcut: keys ? shortcut(keys) : undefined };
            })}
            onValueChange={a.onTurnInto}
          />
        )}
      </Menu.Group>
    </Menu.Content>
  );
}

function FixedRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cn(row, "cursor-default")}>
      <RowContent detail={value}>{label}</RowContent>
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
