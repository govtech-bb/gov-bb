import type { ValidationType } from "@govtech-bb/form-types";
import type { RuleRunner } from "../types";
import { requiredRunner } from "./required";
import {
  minLengthRunner,
  maxLengthRunner,
  patternRunner,
  emailRunner,
  containsRunner,
  strictEqualityRunner,
} from "./string";
import {
  minRunner,
  maxRunner,
  gtRunner,
  ltRunner,
  equalRunner,
  notEqualRunner,
} from "./number";
import {
  pastRunner,
  pastOrTodayRunner,
  futureRunner,
  futureOrTodayRunner,
  afterRunner,
  beforeRunner,
  onOrAfterRunner,
  onOrBeforeRunner,
  minYearRunner,
  maxYearRunner,
} from "./date";
import {
  minItemsRunner,
  maxItemsRunner,
  minSelectionRunner,
  maxSelectionRunner,
  radioRunner,
} from "./array";
import { fileTypesRunner, itemMaxSizeRunner, maxSizeRunner } from "./file";

export const RULE_REGISTRY: Partial<Record<ValidationType, RuleRunner>> = {
  required: requiredRunner,
  minLength: minLengthRunner,
  maxLength: maxLengthRunner,
  pattern: patternRunner,
  email: emailRunner,
  contains: containsRunner,
  strictEquality: strictEqualityRunner,
  min: minRunner,
  max: maxRunner,
  gt: gtRunner,
  lt: ltRunner,
  equal: equalRunner,
  notEqual: notEqualRunner,
  past: pastRunner,
  pastOrToday: pastOrTodayRunner,
  future: futureRunner,
  futureOrToday: futureOrTodayRunner,
  after: afterRunner,
  before: beforeRunner,
  onOrAfter: onOrAfterRunner,
  onOrBefore: onOrBeforeRunner,
  minYear: minYearRunner,
  maxYear: maxYearRunner,
  minItems: minItemsRunner,
  maxItems: maxItemsRunner,
  minSelection: minSelectionRunner,
  maxSelection: maxSelectionRunner,
  radio: radioRunner,
  fileTypes: fileTypesRunner,
  itemMaxSize: itemMaxSizeRunner,
  maxSize: maxSizeRunner,
};
