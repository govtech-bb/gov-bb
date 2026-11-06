import type { ReactNode } from "react";
import type { Settings, Setting } from "../model/settings";
import type { FieldArray } from "../model/repetition";
import type { ErrorMessage } from "../formats/legacy-ssb/projection/rules";
import type { NativeErrorMessage } from "../formats/native/native-field-controls";
import type { NativeScalar } from "../formats/native/schema/types";
import type { Resolved } from "../model/identities";

type Patch = Partial<Record<string, Setting | undefined>>;

export type BlockErrorMessage = ErrorMessage | NativeErrorMessage;

export type BlockMenuModel = {
  /** $blockKind of the block holding the settings: the question's first input, or the block itself. */
  kind: string;
  /** Several blocks are selected: the menu acts on all of them, with Delete, Duplicate and Hide only. */
  multi?: boolean;
  followUp?: boolean;
  nested?: { host: string };
  /** Inputs only: the visible question label (or an unlabelled fallback) and type icon. */
  header?: { name: string; icon: ReactNode };
  fieldId?: Resolved & { taken: string[] };
  fieldArray?: { value?: FieldArray; auto: string };
  errors: BlockErrorMessage[];
  optionValues: {
    key: string;
    label: string;
    value: NativeScalar;
    pinned: boolean;
    native: boolean;
  }[];
  settings: Settings;
  /** Undefined when this block cannot be hidden. */
  hidden?: boolean;
  /** Whether the question has hint text; undefined without a question label. */
  hint?: boolean;
  turnInto?: { value: string; options: [kind: string, label: string, icon: ReactNode][] };
};

export type BlockMenuActions = {
  onSettings: (patch: Patch) => void;
  onFieldId: (id: string | undefined) => void;
  onErrorMessage: (error: BlockErrorMessage, text: string | undefined) => void;
  onOptionValue: (optionKey: string, value: NativeScalar | undefined) => void;
  onEditHint: () => void;
  onRemoveHint: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onHide: () => void;
  onAddLogic: () => void;
  onAddFollowUp: () => void;
  onMoveOut: () => void;
  onBulkInsert: () => void;
  onTurnInto: (kind: string) => void;

  onClose?: () => void;
};
