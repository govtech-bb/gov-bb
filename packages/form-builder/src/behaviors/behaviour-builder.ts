export type BehaviourScope = "field" | "step";

export type ParamKind =
  | "fieldRef" // renders a FieldRefPicker
  | "stepRef" // renders a StepRefPicker
  | "operator" // renders an operator dropdown
  | "value" // renders a value input
  | "number" // renders a number input
  | "fieldRefArray" // renders a checkbox list of the current step's fields (for sharedFields.fieldIds, #792)
  | "text"; // renders a plain text input (free text, e.g. addAnotherLabel)

export interface BehaviourParamDescriptor {
  name: string; // parameter key in the behaviour object
  label: string; // display label
  kind: ParamKind;
  optional?: boolean;
  // For "text" params: shown as the input placeholder, so authors can see the
  // runtime default they'd be overriding (e.g. "Add another?").
  placeholder?: string;
  // For "number" params (#771):
  defaultValue?: number; // initial value on add (falls back to 0)
  minValue?: number; // hard floor: applied as input min attr and onChange clamp
  atLeastParam?: string; // floor is another param's current value (e.g. max >= min)
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
      {
        name: "min",
        label: "Min",
        kind: "number",
        defaultValue: 1,
        minValue: 1,
      },
      {
        name: "max",
        label: "Max",
        kind: "number",
        defaultValue: 5,
        minValue: 1,
        atLeastParam: "min",
      },
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
      // Optional noun marking repeat instances beyond the first (form-types
      // repeatableBehaviourSchema.instanceLabel), e.g. "Dependent" → the
      // second instance renders "Dependent 2". Blank means absent: the
      // runtime auto-numbers the step title instead.
      {
        name: "instanceLabel",
        label: "Instance label",
        kind: "text",
        optional: true,
        placeholder: "e.g. Dependent",
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
    params: [{ name: "fieldIds", label: "Field IDs", kind: "fieldRefArray" }],
  },
];
