import { ValidationRule, Primitive } from "../../types";

class ValidationBuilder {
  fieldId: string;
  fieldLabel: string;
  rules: ValidationRule = {};

  constructor(parent: Primitive) {
    this.fieldId = parent.fieldId;
    this.fieldLabel = parent.label;
  }

  required(value?: boolean, error?: string): this {
    this.rules["required"] = {
      value: value ?? true,
      error: error ?? `${this.fieldLabel} is required`,
    };
    return this;
  }

  optional(): this {
    return this.required(false, "");
  }

  pattern(regex: string, error?: string): this {
    this.rules["pattern"] = {
      value: regex,
      error: error ?? `${this.fieldLabel} is invalid`,
    };
    return this;
  }

  pattern_alpha(error?: string): this {
    let e = error ?? `${this.fieldLabel} is letters only`;
    let regex = "^[a-zA-Z]*$";
    return this.pattern(regex, e);
  }

  minLength(value: number, error?: string): this {
    this.rules["minLength"] = {
      value,
      error: error ?? `${this.fieldLabel} must be at least ${value} characters`,
    };
    return this;
  }

  maxLength(value: number, error?: string): this {
    this.rules["maxLength"] = {
      value,
      error: error ?? `${this.fieldLabel} must be at most ${value} characters`,
    };
    return this;
  }

  min(value: number, error?: string): this {
    this.rules["min"] = {
      value,
      error: error ?? `${this.fieldLabel} must be at least ${value}`,
    };
    return this;
  }

  max(value: number, error?: string): this {
    this.rules["max"] = {
      value,
      error: error ?? `${this.fieldLabel} must be at most ${value}`,
    };
    return this;
  }

  conditionalOn(fieldId: string, value: any, error?: string): this {
    this.rules["conditionalOn"] = {
      value,
      reference: fieldId,
      error: error ?? `${this.fieldLabel} has a condition`,
    };
    return this;
  }

  past(error?: string): this {
    this.rules["past"] = {
      error: error ?? `${this.fieldLabel} must be in the past`,
    };
    return this;
  }

  pastOrToday(error?: string): this {
    this.rules["pastOrToday"] = {
      error: error ?? `${this.fieldLabel} must be today or in the past`,
    };
    return this;
  }

  future(error?: string): this {
    this.rules["future"] = {
      error: error ?? `${this.fieldLabel} must be in the future`,
    };
    return this;
  }

  futureOrToday(error?: string): this {
    this.rules["futureOrToday"] = {
      error: error ?? `${this.fieldLabel} must be today or in the future`,
    };
    return this;
  }

  getDateAsStr(date: Date): string {
    // Returns a date as DD/MM/YYYY

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDay();

    const result = `${day}/${month}/${year}`;
    return result;
  }

  after(date: Date, error?: string): this {
    const dateStr: string = this.getDateAsStr(date);
    this.rules["after"] = {
      value: dateStr,
      error:
        error ?? `${this.fieldLabel} must be after ${dateStr} (DD/MM/YYYY)`,
    };
    return this;
  }

  before(date: Date, error?: string): this {
    const dateStr: string = this.getDateAsStr(date);
    this.rules["before"] = {
      value: dateStr,
      error:
        error ?? `${this.fieldLabel} must be before ${dateStr} (DD/MM/YYYY)`,
    };
    return this;
  }

  onOrAfter(date: Date, error?: string): this {
    const dateStr: string = this.getDateAsStr(date);
    this.rules["onOrAfter"] = {
      value: dateStr,
      error:
        error ??
        `${this.fieldLabel} must be on or after ${dateStr} (DD/MM/YYYY)`,
    };
    return this;
  }

  onOrBefore(date: Date, error?: string): this {
    const dateStr: string = this.getDateAsStr(date);
    this.rules["onOrBefore"] = {
      value: dateStr,
      error:
        error ??
        `${this.fieldLabel} must be on or before ${dateStr} (DD/MM/YYYY)`,
    };
    return this;
  }

  betweenNumbers(min: number, max: number, error?: string): this {
    const betweenError = error ?? `${this.fieldLabel} must be between ${min} and ${max}`;

    this.min(min, betweenError);
    this.max(max, betweenError)
    return this;
  }

  betweenDates(startDate: Date, endDate: Date, error?: string): this {
    const betweenError = error ?? `${this.fieldLabel} must be between ${startDate} and ${endDate}`;

    this.onOrBefore(endDate, betweenError);
    this.onOrAfter(startDate, betweenError);

    return this;
  }

  minYear(value: number, error?: string): this {
    this.rules["minYear"] = {
      value,
      error: error ?? `${this.fieldLabel} year must be at least ${value}`,
    };
    return this;
  }

  maxYear(value: number, error?: string): this {
    this.rules["maxYear"] = {
      value,
      error: error ?? `${this.fieldLabel} year must be at most ${value}`,
    };
    return this;
  }

  minItems(value: number, error?: string): this {
    this.rules["minItems"] = {
      value,
      error: error ?? `${this.fieldLabel} must have at least ${value} items`,
    };
    return this;
  }

  maxItems(value: number, error?: string): this {
    this.rules["maxItems"] = {
      value,
      error: error ?? `${this.fieldLabel} must have at most ${value} items`,
    };
    return this;
  }

  minSelection(value: number = 1, error: string = ""): this {
    if (value <= 1) value = 1;
    this.rules["minSelection"] = {
      value,
      error:
        error ?? `${this.fieldLabel} must have at least ${value} ${value === 1 ? "selection" : "selections"}`,
    };
    return this;
  }

  maxSelection(value: number, error?: string): this {
    if (value <= 1) value = 1;
    this.rules["maxSelection"] = {
      value,
      error:
        error ?? `${this.fieldLabel} must have at most ${value} ${value === 1 ? "selection" : "selections"}`,
    };
    return this;
  }

  email(error?: string): this {
    this.rules["email"] = {
      error: error ?? `${this.fieldLabel} must be a valid email`,
    };
    return this;
  }

  fileTypes(types: string[], error?: string): this {
    this.rules["fileTypes"] = {
      value: types,
      error: error ?? `${this.fieldLabel} must be one of: ${types.join(", ")}`,
    };
    return this;
  }

  itemMaxSize(bytes: number, error?: string): this {
    this.rules["itemMaxSize"] = {
      value: bytes,
      error:
        error ?? `${this.fieldLabel} each item must be at most ${bytes} ${bytes == 1 ? 'byte' : 'bytes'}`,
    };
    return this;
  }

  maxSize(bytes: number, error?: string): this {
    this.rules["maxSize"] = {
      value: bytes,
      error:
        error ?? `${this.fieldLabel} total size must be at most ${bytes} ${bytes == 1 ? 'byte' : 'bytes'}`,
    };
    return this;
  }

  equal(fieldId: string, error?: string): this {
    this.rules["equal"] = {
      reference: fieldId,
      error: error ?? `${this.fieldLabel} must equal ${fieldId}'s value`,
    };
    return this;
  }

  notEqual(fieldId: string, error?: string): this {
    this.rules["notEqual"] = {
      reference: fieldId,
      error: error ?? `${this.fieldLabel} must not equal ${fieldId}'s value`,
    };
    return this;
  }

  gt(fieldId: string, error?: string): this {
    this.rules["gt"] = {
      reference: fieldId,
      error: error ?? `${this.fieldLabel} must be greater than ${fieldId}'s value`,
    };
    return this;
  }

  lt(fieldId: string, error?: string): this {
    this.rules["lt"] = {
      reference: fieldId,
      error: error ?? `${this.fieldLabel} must be less than ${fieldId}'s value`,
    };
    return this;
  }

  contains(value: string, error?: string): this {
    this.rules["contains"] = {
      value,
      error: error ?? `${this.fieldLabel} must contain ${value}`,
    };
    return this;
  }

  strictEquality(fieldId: string, error?: string): this {
    this.rules["equal"] = {
      reference: fieldId,
      error: error ?? `${this.fieldLabel} must exactly match ${fieldId}'s value`,
    };
    return this;
  }

  collapse(): ValidationRule {
    return this.rules;
  }
}

export { ValidationBuilder }
