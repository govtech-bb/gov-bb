export type BehaviourScope = "field" | "step";

export type ParamKind =
  | "fieldRef" // renders a FieldRefPicker
  | "stepRef" // renders a StepRefPicker
  | "operator" // renders an operator dropdown
  | "value" // renders a value input
  | "number" // renders a number input
  | "stringArray" // renders a comma-separated string input (for sharedFields.fieldIds)
  | "text"; // renders a plain text input (free text, e.g. addAnotherLabel)

export interface BehaviourParamDescriptor {
  name: string; // parameter key in the behaviour object
  label: string; // display label
  kind: ParamKind;
  optional?: boolean;
  // For "text" params: shown as the input placeholder, so authors can see the
  // runtime default they'd be overriding (e.g. "Add another?").
  placeholder?: string;
}

export interface BehaviourTypeDescriptor {
  type: string; // matches Behaviour["type"]
  label: string; // display name
  scopes: BehaviourScope[];
  params: BehaviourParamDescriptor[];
}

export const BEHAVIOUR_TYPE_DESCRIPTORS: BehaviourTypeDescriptor[] = [
  {
    type: "fieldConditionalOn",
    label: "Field Conditional On",
    scopes: ["field"],
    // Target Step precedes Target Field: the editor scopes (and gates) the
    // field picker on the selected step (#519).
    params: [
      {
        name: "targetStepId",
        label: "Target Step",
        kind: "stepRef",
        optional: true,
      },
      { name: "targetFieldId", label: "Target Field", kind: "fieldRef" },
      { name: "operator", label: "Operator", kind: "operator" },
      { name: "value", label: "Value", kind: "value" },
    ],
  },
  {
    type: "stepConditionalOn",
    label: "Step Conditional On",
    scopes: ["step"],
    params: [
      { name: "targetStepId", label: "Target Step", kind: "stepRef" },
      { name: "targetFieldId", label: "Target Field", kind: "fieldRef" },
      { name: "operator", label: "Operator", kind: "operator" },
      { name: "value", label: "Value", kind: "value" },
    ],
  },
  {
    type: "repeatable",
    label: "Repeatable",
    scopes: ["step"],
    params: [
      { name: "min", label: "Min", kind: "number" },
      { name: "max", label: "Max", kind: "number" },
      // Optional override for the runtime's auto-generated "Add another?"
      // radio label (form-types repeatableBehaviourSchema.addAnotherLabel).
      // Blank means absent: the editor deletes the key so the runtime
      // fallback applies — it must never store "".
      {
        name: "addAnotherLabel",
        label: "Add another label",
        kind: "text",
        optional: true,
        placeholder: "Add another?",
      },
    ],
  },
  {
    type: "fieldArray",
    label: "Field Array",
    scopes: ["field"],
    params: [
      { name: "min", label: "Min", kind: "number" },
      { name: "max", label: "Max", kind: "number" },
    ],
  },
  {
    type: "sharedFields",
    label: "Shared Fields",
    scopes: ["step"],
    params: [{ name: "fieldIds", label: "Field IDs", kind: "stringArray" }],
  },
];
