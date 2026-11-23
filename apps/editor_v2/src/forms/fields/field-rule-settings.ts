import type { Settings } from "../model/settings";
import { defineSetting, replaceRule, ruleLimit } from "../settings/define-setting";

// Settings several fields declare, each kept as a validation rule

/** The fewest and most characters an answer may have. */
export const characterLimits = [
  ruleLimit("hasMinCharacters", "minCharacters", "minLength"),
  ruleLimit("hasMaxCharacters", "maxCharacters", "maxLength"),
];

/** The fewest and most options a person may choose. */
export const choiceLimits = [
  ruleLimit("hasMinChoices", "minChoices", "minSelections"),
  ruleLimit("hasMaxChoices", "maxChoices", "maxSelections"),
];

/** A pattern the answer must match, kept as a pattern rule with its flags. */
export const answerPattern = defineSetting({
  keys: ["pattern"],
  read(question): Settings {
    const rule = question.validation?.findLast((item) => item.type === "pattern");

    return rule?.type === "pattern" ? { pattern: rule.pattern } : {};
  },
  write(draft, _patch, merged) {
    replaceRule(
      draft,
      "pattern",
      merged.pattern
        ? {
            pattern: merged.pattern,
            flags: draft.validation.find((rule) => rule.type === "pattern")?.flags ?? "u",
          }
        : undefined,
    );
  },
});
