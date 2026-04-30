import {
  Behaviour,
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  RepeatableBehaviour,
  FieldArrayBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";

class BehaviourBuilder {
  fieldId: string;
  stepId: string;
  behaviours: Behaviour[] = [];

  constructor(fieldId: string, stepId: string) {
    this.fieldId = fieldId;
    this.stepId = stepId;
  }

  fieldConditionalOn(
    targetFieldId: string,
    value: string | number,
    operator: "equal" | "notEqual" | "in" | "exists" = "exists",
    targetStepId?: string,
  ): this {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId,
      ...((targetStepId && { targetStepId }) || { targetStepId: this.stepId }),
      operator,
      value,
    };
    this.behaviours.push(behaviour);
    return this;
  }

  stepConditionalOn(
    targetFieldId: string,
    value: string | number,
    operator: "equal" | "notEqual" | "in" | "exists" = "exists",
    targetStepId: string,
  ): this {
    const behaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetFieldId,
      targetStepId,
      operator,
      value,
    };
    this.behaviours.push(behaviour);
    return this;
  }

  repeatable(min: number = 1, max: number = 10): this {
    const behaviour: RepeatableBehaviour = {
      type: "repeatable",
      min,
      max,
    };
    this.behaviours.push(behaviour);
    return this;
  }

  fieldArray(min: number = 1, max: number = 10): this {
    const behaviour: FieldArrayBehaviour = {
      type: "fieldArray",
      min,
      max,
    };
    this.behaviours.push(behaviour);
    return this;
  }

  sharedFields(fieldIds: string[]): this {
    const behaviour: SharedFieldsBehaviour = {
      type: "sharedFields",
      fieldIds,
    };
    this.behaviours.push(behaviour);
    return this;
  }

  collapse(): Behaviour[] {
    return this.behaviours;
  }
}

export { BehaviourBuilder };
