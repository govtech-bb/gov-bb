import {
  Behaviour,
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  RepeatableBehaviour,
  FieldArrayBehaviour,
  SharedFieldsBehaviour,
} from "../../types";

class BehaviourBuilder {
  fieldId: string;
  behaviours: Behaviour[] = [];

  constructor(fieldId: string) {
    this.fieldId = fieldId;
  }

  fieldConditionalOn(
    targetFieldId: string,
    value: string | number,
    operator: "equal" | "notEqual" | "in" | "exists" = "exists",
  ): this {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId,
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
  ): this {
    const behaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetFieldId,
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
