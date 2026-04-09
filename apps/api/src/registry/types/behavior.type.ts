export type Behaviour =
  | FieldConditionalOnBehaviour
  | StepConditionalOnBehaviour
  | RepeatableBehaviour
  | FieldArrayBehaviour
  | SharedFieldsBehaviour;

export interface FieldConditionalOnBehaviour {
  type: "fieldConditionalOn";
  targetFieldId: string;
  operator: "equal" | "notEqual" | "in" | "exists";
  value: string | number;
}

export interface StepConditionalOnBehaviour {
  type: "stepConditionalOn";
  targetFieldId: string;
  operator: "equal" | "notEqual" | "in" | "exists";
  value: string | number;
}

export interface RepeatableBehaviour {
  type: "repeatable";
  min: number;
  max: number;
}

export interface FieldArrayBehaviour {
  type: "fieldArray";
  min: number;
  max: number;
}

export interface SharedFieldsBehaviour {
  type: "sharedFields";
  fieldIds: string[];
}
