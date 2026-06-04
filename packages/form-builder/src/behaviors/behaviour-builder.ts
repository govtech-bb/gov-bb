export type BehaviourScope = "field" | "step";

export type ParamKind =
  | "fieldRef" // renders a FieldRefPicker
  | "stepRef" // renders a StepRefPicker
  | "operator" // renders an operator dropdown
  | "value" // renders a value input
  | "number" // renders a number input
  | "stringArray"; // renders a comma-separated string input (for sharedFields.fieldIds)

export interface BehaviourParamDescriptor {
  name: string; // parameter key in the behaviour object
  label: string; // display label
  kind: ParamKind;
  optional?: boolean;
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
    // Relaxes `required` when the condition matches, without hiding the
    // field (#625) — e.g. National ID becomes optional once the "use
    // passport instead" toggle is on. Same param shape as fieldConditionalOn,
    // so it inherits the #519 step-gated field picker and the #565
    // boolean-aware value control.
    type: "optionalIf",
    label: "Optional If",
    scopes: ["field"],
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
