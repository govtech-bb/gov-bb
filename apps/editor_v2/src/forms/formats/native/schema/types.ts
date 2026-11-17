/** Native form definitions contain data only; editor state and installed implementations stay outside. */
export type NativeScalar = string | number | boolean;

export type JsonValue = NativeScalar | null | JsonValue[] | { [key: string]: JsonValue };

export type NativeScope = "form" | "current";

export type NativeValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "time"
  | "string[]"
  | "number[]"
  | "boolean[]"
  | "file[]";

export type NativeReferenceValue =
  | { answer: string; scope?: NativeScope }
  | { value: string; scope?: NativeScope }
  | { context: "today" | "submissionReference" | "submittedAt" };

export type DisplayFormat =
  | { type: "number"; fractionDigits?: number }
  | { type: "currency"; currency: string; fractionDigits?: number }
  | { type: "date"; style?: "short" | "medium" | "long" | "full" }
  | { type: "choice-label" }
  | { type: "boolean-label"; trueLabel?: string; falseLabel?: string };

export type DisplayReference = NativeReferenceValue & { format?: DisplayFormat; fallback?: string };

export type TextMark = "bold" | "italic" | "underline" | "strikethrough" | "code";

export type RichText = string | RichTextInline[];

export type RichTextInline =
  | string
  | DisplayReference
  | { text: string; marks?: TextMark[] }
  | { link: string; content: RichText }
  | { break: true };

export type Expression =
  | NativeScalar
  | NativeReferenceValue
  | {
      op:
        | "add"
        | "subtract"
        | "multiply"
        | "divide"
        | "min"
        | "max"
        | "coalesce"
        | "year"
        | "monthsBetween"
        | "wholeYearsBetween"
        | "daysBetween"
        | "concat"
        | "toText";
      args: Expression[];
    }
  | { op: "round"; args: [Expression]; increment: number; ties: "towardPositiveInfinity" }
  | {
      op: "lookup";
      args: [Expression];
      entries: { key: NativeScalar; value: Expression }[];
      fallback: Expression;
    };

export type Condition =
  | boolean
  | { op: "all" | "any"; conditions: Condition[] }
  | { op: "not"; condition: Condition }
  | {
      op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "startsWith" | "endsWith";
      left: Expression;
      right: Expression;
    }
  | { op: "empty"; value: Expression }
  | { op: "selected"; question: string; option: string; scope?: NativeScope };

export type VisibilityTarget =
  | string
  | { question: string; option: string }
  | { question: string; part: "label" | "hint" | "input" }
  | { list: string; item: string };

export type Layout = { under: { block: string } | { question: string; option: string } };

export type LogicAction =
  | { type: "setVisible"; targets: VisibilityTarget[]; value: boolean }
  | { type: "setRequired"; target: string; value: boolean }
  | { type: "setLabel" | "setTitle"; target: string; value: RichText }
  | { type: "setValue"; target: string; value: Expression }
  | { type: "error"; target: string; message: string }
  | { type: "goTo"; target: string }
  | { type: "setCompletionEnabled"; value: boolean };

export type LogicRule = { id: string; when: Condition; actions: LogicAction[]; enabled?: boolean };

export type ValidationRule = { id: string; message: string } & (
  | {
      type:
        | "minLength"
        | "maxLength"
        | "minAge"
        | "maxAge"
        | "minSelections"
        | "maxSelections"
        | "minFiles"
        | "maxFiles";
      value: number;
    }
  | { type: "minimum" | "maximum"; value: number; inclusive?: boolean }
  | { type: "pattern"; pattern: string; flags: string }
  | { type: "integer" | "email" | "phone" }
  | { type: "equals"; value: NativeScalar }
  | { type: "dateBefore" | "dateAfter"; value: Expression; inclusive?: boolean }
  | { type: "fileTypes" | "dateIn"; value: string[] }
  | { type: "maxFileSize"; value: number; unit: "MB" }
);

export type QuestionRepeat = { min: number; max?: number; addLabel: string };

export type PageRepeat = QuestionRepeat & { key: string; itemLabel?: string };

export type QuestionOption = {
  id: string;
  label: RichText;
  value: NativeScalar;
  visible?: boolean;
};

export type QuestionParts = {
  label?: { visible?: boolean };
  hint?: { visible?: boolean };
  input?: { visible?: boolean };
};

export type QuestionBase = {
  id: string;
  type: "question";
  kind: string;
  key: string;
  label: RichText;
  hint?: RichText | ContentBlock[];
  visible?: boolean;
  disabled?: boolean;
  default?: NativeScalar | NativeScalar[] | { context: "today" };
  required?: { value: boolean; message: string };
  validation?: ValidationRule[];
  options?: QuestionOption[];
  config?: unknown;
  submit?: boolean;
  review?: boolean;
  repeat?: QuestionRepeat;
  parts?: QuestionParts;
  layout?: Layout;
};

export type NativeQuestion<K extends string, C = never> = Omit<
  QuestionBase,
  "kind" | "config" | "default"
> & {
  kind: K;
  config?: C;
  default?: NativeScalar | NativeScalar[] | ("date" extends K ? { context: "today" } : never);
};

export type InputWidth = "short" | "medium" | "long";

export type TextConfig = { width?: InputWidth; placeholder?: string; mask?: string };

export type ChoiceConfig = {
  placeholder?: string;
  width?: InputWidth;
  selection: "single" | "multiple";
  presentation?: "radio" | "checkboxes" | "dropdown" | "accordion";
  groups?: { id: string; label: RichText; higherRisk?: boolean; optionIds: string[] }[];
};

export type QuestionBlock =
  | NativeQuestion<"text" | "long-text" | "email" | "phone", TextConfig>
  | NativeQuestion<"number", { width?: InputWidth; placeholder?: string; step?: number }>
  | NativeQuestion<"time", { width?: InputWidth; placeholder?: string; stepSeconds?: number }>
  | NativeQuestion<"address-lookup", { placeholder?: string; provider?: string }>
  | NativeQuestion<"file", { multiple?: boolean }>
  | NativeQuestion<"opening-hours" | "date" | "boolean", Record<string, never>>
  | NativeQuestion<"choice", ChoiceConfig>;

export type ContentBase = {
  id: string;
  type: "content";
  kind: string;
  content: RichText;
  visible?: boolean;
  config?: unknown;
  layout?: Layout;
};

export type NativeContent<K extends string, C = never> = Omit<ContentBase, "kind" | "config"> & {
  kind: K;
  config?: C;
};

export type ContentBlock =
  | NativeContent<"paragraph" | "question-label", Record<string, never>>
  | NativeContent<"heading", { level: 1 | 2 | 3 }>
  | NativeContent<"callout", { tone: "inset" | "warning" }>
  | NativeContent<
      "list",
      { ordered?: boolean; items: { id: string; content: RichText; visible?: boolean }[] }
    >
  | NativeContent<"expandable", { blocks: ContentBlock[] }>;

export type PageRole = "questions" | "review" | "declaration" | "confirmation" | "result";

export type PageBlock = {
  id: string;
  type: "page";
  role: PageRole;
  title: RichText;
  description?: RichText;
  visible?: boolean;
  repeat?: PageRepeat;
  navigation?: { nextLabel?: string; backLabel?: string };
  review?: { questions: "preceding"; emptyAnswers: "omit" | "show"; changeLinks: boolean };
};

export type CalculatedBlock = {
  id: string;
  type: "calculated";
  name?: string;
  valueType: "string" | "number" | "boolean" | "date";
  expression?: Expression;
  key?: string;
  submit?: boolean;
  visible?: boolean;
};

export type LogicBlock = { id: string; type: "logic"; rules: LogicRule[]; visible?: boolean };

export type FormBlock<
  Q extends QuestionBase = QuestionBlock,
  C extends ContentBase = ContentBlock,
> = PageBlock | Q | C | CalculatedBlock | LogicBlock;

export type FormSettingsV2 = {
  visibility: "draft" | "preview" | "public" | "maintenance";
  hiddenAnswers: "retain" | "clear";
  closingDateTime?: string;
  contact?: {
    title?: string;
    telephoneNumber?: string;
    email?: string;
    address?: { line1: string; line2?: string; city: string; country?: string };
  };
  notifications?: {
    applicant?: { enabled: boolean; recipient: { answer: string }; subject?: string };
    department?: {
      enabled: boolean;
      recipient: { context: "departmentEmail" } | { contact: "email" };
      subject?: string;
    };
  };
};

export type FormDefinitionV2<
  Q extends QuestionBase = QuestionBlock,
  C extends ContentBase = ContentBlock,
> = {
  schemaVersion: 2;
  id: string;
  title: string;
  description?: RichText;
  mode: "application" | "calculator";
  locale: string;
  timeZone: string;
  settings: FormSettingsV2;
  blocks: FormBlock<Q, C>[];
};

/** Installed extensions keep their own typed config; these erased envelopes are the dispatch boundary. */
export type AnyFormBlock = FormBlock<QuestionBase, ContentBase>;

export type AnyFormDefinition = FormDefinitionV2<QuestionBase, ContentBase>;
