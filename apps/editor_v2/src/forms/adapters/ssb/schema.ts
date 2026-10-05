import type { Settings } from "../../core/settings";
import type { Action, Condition, LogicalOperator, LogicValue } from "../../core/logic";
import type { ConditionalLabel, ConditionalTitle, WordingIssue } from "../../core/dynamic-text";
import type { RuleName } from "./rules";
import type { FieldArrayBehaviour, RepeatableBehaviour } from "../../core/repetition";
import type { FieldConditionalOnBehaviour } from "./nesting";
import type { ServiceContract } from "../../core/form-settings";
import type { PageType } from "../../core/pages";

/** Compatibility schema for the SSB export adapter. */
export type FormGroup = import("../../core/choice-groups").ChoiceGroup;

export type FormOption = {
  id: string;
  label: string;
  value: string;
  other?: boolean;
  hidden?: boolean;
  disabled?: boolean;
};

export type FormText = {
  type: "text";
  id: string;
  style: "paragraph" | "h1" | "h2" | "h3" | "title";
  markdown: string;
  hidden?: boolean;
};

export type FormWidget = {
  type: "widget";
  id: string;
  kind: string;
  settings: Settings;
  hidden?: boolean;
};

export type FormQuestion = {
  type: "question";
  /** The answer's key: the question's field id (see $questionKey), stable as its blocks change. */
  id: string;
  fieldId: string;
  ref: string;
  kind: string;
  /** Inline Markdown; empty for an untitled input. */
  title: string;
  /** The title block's id: it hides on its own. */
  titleId?: string;
  /** Text between the title and the input. */
  description: (FormText | FormWidget)[];
  placeholder: string;
  options: FormOption[];
  groups?: FormGroup[];
  /** The block menu's settings (required, min characters…). */
  settings: Settings;
  errors: Partial<Record<RuleName, string>>;
  behaviours?: FieldArrayBehaviour[];
  /** Visibility is independent for the question label, its answer block and individual options. */
  hidden?: boolean;
  titleHidden?: boolean;
  conditionalLabel?: ConditionalLabel[];
};

export type FormLogic = {
  type: "logic";
  id: string;
  logicalOperator: LogicalOperator;
  conditionals: Condition[];
  actions: Action[];
};

export type FormCalculatedFields = {
  type: "calculated-fields";
  id: string;
  fields: { key: string; name: string; type: "NUMBER" | "TEXT"; value?: LogicValue }[];
};

/** Nesting metadata is omitted for top-level blocks. */
export type Nested = {
  /** 1 under an option or inside a show/hide, 2 under one of those, and so on. */
  depth?: number;
  /** The option (FormOption.id) or show/hide (FormSection.id) it sits under. */
  under?: string;
  /** SSB conditions that show it, all of which must hold. The export adds them to the element's behaviours. */
  shownWhen?: FieldConditionalOnBehaviour[];
  /** SSB's ui.indent: draw the reveal rail where SSB wouldn't nest it (under a lone checkbox, or inside a show/hide). */
  indent?: true;
};

export type FormSection = {
  type: "section";
  id: string;
  fieldId: string;
  summary: string;
  ssb: "details" | "show-hide";
  hidden?: boolean;
};

export type FormCallout = {
  type: "callout";
  id: string;
  fieldId: string;
  variant: "inset" | "warning";
  markdown: string;
  hidden?: boolean;
};

export type FormList = {
  type: "list";
  id: string;
  ordered: boolean;
  items: { id: string; markdown: string; hidden?: boolean }[];
};

export type FormBlock = (
  | FormText
  | FormWidget
  | FormQuestion
  | FormLogic
  | FormCalculatedFields
  | FormSection
  | FormCallout
  | FormList
) &
  Nested;

export type FormPage = {
  id: string;
  stepId: string;
  pageType: PageType;
  name?: string;
  button?: string;
  confirmation: boolean;
  blocks: FormBlock[];
  behaviours?: RepeatableBehaviour[];
  /** SSB's step title, always set by compileForm; optional for hand-built schemas. */
  title?: string;
  /** SSB's plain-text step description, when present. */
  description?: string;
  conditionalTitle?: ConditionalTitle[];
};

/** The title is inline Markdown too; the remaining top-level keys come from the form metadata adapter. */
export type LegacySsbFormSchema = {
  title: string;
  pages: FormPage[];
  dynamicTextIssues?: WordingIssue[];
} & ServiceContract;
