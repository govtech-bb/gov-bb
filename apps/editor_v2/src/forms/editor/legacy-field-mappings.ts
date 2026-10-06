import { createLegacyFieldHandler, type ResolvedFieldSsbHandler } from "./legacy-contracts";
import { readShortAnswerSettings } from "../features/short-answer/definition";
import { relativeDateOf, RELATIVE_DATE_ERRORS } from "../core/field-settings";
import { type Rule } from "../adapters/ssb/rules";
import { readLongAnswerSettings } from "../features/long-answer/definition";
import { cleanSettings } from "../features/shared/settings";
import { readEmailSettings } from "../features/email/definition";
import { readPhoneSettings } from "../features/phone/definition";
import { readNumberSettings } from "../features/number/definition";
import { readDateSettings } from "../features/date/definition";
import { readTimeSettings } from "../features/time/definition";
import { readFileUploadSettings } from "../features/file-upload/definition";
import { type Settings } from "../core/settings";
import { fileTypesOf, fileExtensions } from "../features/file-upload/files";
import { readMultipleChoiceSettings } from "../features/multiple-choice/definition";
import { selectionRequiredMessage } from "../features/shared/wording";
import { readCheckboxesSettings } from "../features/checkboxes/definition";
import { readDropdownSettings } from "../features/dropdown/definition";
import { readCheckboxAccordionSettings } from "../features/checkbox-accordion/definition";
import { compileGroups, groupIssues } from "../features/checkbox-accordion/groups";
import { readAddressLookupSettings } from "../features/address-lookup/definition";
import { readOpeningHoursSettings } from "../features/opening-hours/definition";

/** Selected only by the explicit SSB compatibility path. */
export const legacyFieldHandlers: Readonly<Record<string, ResolvedFieldSsbHandler>> = Object.freeze(
  {
    text: createLegacyFieldHandler(readShortAnswerSettings, {
      ref: "components/generic-text",
      settings: (_settings, raw) => {
        const copy = { ...raw };
        delete copy.ref;
        delete copy.step;

        if (!relativeDateOf(copy)) delete copy.relativeDate;

        if (copy.isDisabled === false) delete copy.isDisabled;

        return copy;
      },
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinCharacters && raw.minCharacters !== undefined && raw.minCharacters !== "")
          rules.push({ rule: "minLength", label: "Too few characters", value: raw.minCharacters });

        if (raw.hasMaxCharacters && raw.maxCharacters !== undefined && raw.maxCharacters !== "")
          rules.push({ rule: "maxLength", label: "Too many characters", value: raw.maxCharacters });

        if (typeof raw.pattern === "string" && raw.pattern)
          rules.push({ rule: "pattern", label: "Wrong format", value: raw.pattern });

        return rules;
      },
    }),
    "long-answer": createLegacyFieldHandler(readLongAnswerSettings, {
      ref: "components/generic-textarea",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "pattern", "mask"]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinCharacters && raw.minCharacters !== undefined && raw.minCharacters !== "")
          rules.push({ rule: "minLength", label: "Too few characters", value: raw.minCharacters });

        if (raw.hasMaxCharacters && raw.maxCharacters !== undefined && raw.maxCharacters !== "")
          rules.push({ rule: "maxLength", label: "Too many characters", value: raw.maxCharacters });

        return rules;
      },
    }),
    email: createLegacyFieldHandler(readEmailSettings, {
      ref: "components/generic-email",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "pattern", "mask"]),
      rules: (settings) => [
        ...(settings.required ? [{ rule: "required" as const, label: "When it's empty" }] : []),
        { rule: "email", label: "Invalid email address" },
      ],
      message: (rule) =>
        rule === "email"
          ? "Enter an email address in the correct format, like name@example.com"
          : undefined,
    }),
    phone: createLegacyFieldHandler(readPhoneSettings, {
      ref: "components/generic-tel",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "pattern", "mask"]),
      rules: (settings) => [
        ...(settings.required ? [{ rule: "required" as const, label: "When it's empty" }] : []),
        { rule: "phone", label: "Invalid telephone number" },
      ],
      message: (rule) =>
        rule === "phone" ? "Enter a telephone number, like 246 123 4567" : undefined,
    }),
    number: createLegacyFieldHandler(readNumberSettings, {
      ref: "components/generic-number",
      settings: (_settings, raw) => cleanSettings(raw, ["pattern", "mask"]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinNumber && raw.minNumber !== undefined && raw.minNumber !== "")
          rules.push({ rule: "min", label: "Below the minimum", value: raw.minNumber });

        if (raw.hasMaxNumber && raw.maxNumber !== undefined && raw.maxNumber !== "")
          rules.push({ rule: "max", label: "Above the maximum", value: raw.maxNumber });

        return rules;
      },
    }),
    date: createLegacyFieldHandler(readDateSettings, {
      ref: "components/generic-date",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "pattern", "mask", "width"]),
      message: (rule, { value }) =>
        rule === "min"
          ? `Age must be ${value} or over`
          : rule === "max"
            ? `Age must be ${value} or under`
            : undefined,
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];
        const relative = relativeDateOf(raw);

        if (relative) rules.push({ rule: relative, label: RELATIVE_DATE_ERRORS[relative] });

        if (raw.beforeDate)
          rules.push({ rule: "before", label: "After the allowed date", value: raw.beforeDate });

        if (raw.afterDate)
          rules.push({ rule: "after", label: "Before the allowed date", value: raw.afterDate });
        const range = raw.dateRange;

        if (range && typeof range === "object" && !Array.isArray(range)) {
          if (range.from)
            rules.push({ rule: "onOrAfter", label: "Outside the date range", value: range.from });

          if (range.to)
            rules.push({ rule: "onOrBefore", label: "Outside the date range", value: range.to });
        }

        if (raw.hasMinAge && raw.minAge !== undefined && raw.minAge !== "")
          rules.push({ rule: "min", label: "Younger than the minimum age", value: raw.minAge });

        if (raw.hasMaxAge && raw.maxAge !== undefined && raw.maxAge !== "")
          rules.push({ rule: "max", label: "Older than the maximum age", value: raw.maxAge });

        return rules;
      },
    }),
    time: createLegacyFieldHandler(readTimeSettings, {
      ref: "components/generic-time",
      settings: (_settings, raw) => cleanSettings(raw, ["pattern", "mask"]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        return rules;
      },
    }),
    "file-upload": createLegacyFieldHandler(readFileUploadSettings, {
      ref: "components/generic-file",
      settings: (settings, raw) => {
        const copy: Settings = { ...raw, allowedFiles: settings.types };

        for (const key of ["ref", "step", "pattern", "mask", "width", "hideLabel"])
          delete copy[key];

        if (!relativeDateOf(copy)) delete copy.relativeDate;

        if (copy.isDisabled === false) delete copy.isDisabled;

        return copy;
      },
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];
        rules.push({ rule: "fileTypes", label: "File type not allowed", value: fileTypesOf(raw) });

        for (const [rule, label, enabled, key] of [
          ["itemMaxSize", "File too large", "hasMaxFileSize", "maxFileSize"],
          ["minItems", "Too few files", "hasMinFiles", "minFiles"],
          ["maxItems", "Too many files", "hasMaxFiles", "maxFiles"],
        ] as const)
          if (raw[enabled] && raw[key] !== undefined && raw[key] !== "")
            rules.push({ rule, label, value: raw[key] });

        return rules;
      },
      message: (rule, { value, label }) =>
        rule === "required"
          ? label.trim().endsWith("?")
            ? `Answer “${label.trim()}”`
            : `Upload ${(label.trim() || "File upload")
                .replace(/[?:]$/, "")
                .trim()
                .replace(/^[A-Z][a-z]/, (start) => start[0]!.toLowerCase() + start[1])}`
          : rule === "fileTypes"
            ? `The file must be a ${fileExtensions(fileTypesOf({ allowedFiles: value ?? [] }))}`
            : rule === "itemMaxSize"
              ? `The file must be smaller than ${value}MB`
              : rule === "minItems"
                ? `Upload at least ${value} files`
                : rule === "maxItems"
                  ? `Upload no more than ${value} files`
                  : undefined,
    }),
    "multiple-choice": createLegacyFieldHandler(readMultipleChoiceSettings, {
      ref: "components/generic-radio",
      settings: (_settings, raw) =>
        cleanSettings(raw, [
          "step",
          "pattern",
          "mask",
          "width",
          "hasDefaultAnswer",
          "defaultAnswer",
          "hasMinChoices",
          "minChoices",
          "hasMaxChoices",
          "maxChoices",
        ]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        return rules;
      },
      message: (rule, { label }) =>
        rule === "required" ? selectionRequiredMessage(label, "Radios") : undefined,
    }),
    checkboxes: createLegacyFieldHandler(readCheckboxesSettings, {
      ref: "components/generic-checkbox",
      settings: (_settings, raw) =>
        cleanSettings(raw, [
          "step",
          "pattern",
          "mask",
          "width",
          "hasDefaultAnswer",
          "defaultAnswer",
        ]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinChoices && raw.minChoices !== undefined && raw.minChoices !== "")
          rules.push({ rule: "minSelection", label: "Too few choices", value: raw.minChoices });

        if (raw.hasMaxChoices && raw.maxChoices !== undefined && raw.maxChoices !== "")
          rules.push({ rule: "maxSelection", label: "Too many choices", value: raw.maxChoices });

        return rules;
      },
      message: (rule, { label, optionCount }) =>
        rule === "required"
          ? optionCount === 1
            ? "You must confirm the declaration to continue"
            : selectionRequiredMessage(label, "Checkboxes")
          : undefined,
    }),
    dropdown: createLegacyFieldHandler(readDropdownSettings, {
      placeholder: (_settings, raw) => String(raw.placeholder ?? ""),
      ref: "components/generic-select",
      settings: (_settings, raw) =>
        cleanSettings(raw, [
          "step",
          "pattern",
          "mask",
          "hasDefaultAnswer",
          "defaultAnswer",
          "hasMinChoices",
          "minChoices",
          "hasMaxChoices",
          "maxChoices",
        ]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        return rules;
      },
      message: (rule, { label }) =>
        rule === "required" ? selectionRequiredMessage(label, "Select") : undefined,
    }),
    "checkbox-accordion": createLegacyFieldHandler(readCheckboxAccordionSettings, {
      ref: "components/generic-checkbox-accordion",
      settings: (_settings, raw) =>
        cleanSettings(raw, ["step", "pattern", "mask", "width", "groups"]),
      project: (settings) => compileGroups(settings.groups),
      validateOutput: (question) => groupIssues(question.groups, question.options, question.id),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinChoices && raw.minChoices !== undefined && raw.minChoices !== "")
          rules.push({ rule: "minSelection", label: "Too few choices", value: raw.minChoices });

        if (raw.hasMaxChoices && raw.maxChoices !== undefined && raw.maxChoices !== "")
          rules.push({ rule: "maxSelection", label: "Too many choices", value: raw.maxChoices });

        return rules;
      },
      message: (rule, { label }) =>
        rule === "required" ? selectionRequiredMessage(label, "Grouped checkboxes") : undefined,
    }),
    "address-lookup": createLegacyFieldHandler(readAddressLookupSettings, {
      ref: "components/address-lookup",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "pattern", "mask"]),
      rules: (_settings, raw) => {
        const rules: Rule[] = raw.required ? [{ rule: "required", label: "When it's empty" }] : [];

        if (raw.hasMinCharacters && raw.minCharacters !== undefined && raw.minCharacters !== "")
          rules.push({ rule: "minLength", label: "Too few characters", value: raw.minCharacters });

        if (raw.hasMaxCharacters && raw.maxCharacters !== undefined && raw.maxCharacters !== "")
          rules.push({ rule: "maxLength", label: "Too many characters", value: raw.maxCharacters });

        return rules;
      },
    }),
    "opening-hours": createLegacyFieldHandler(readOpeningHoursSettings, {
      ref: "components/opening-hours",
      settings: (_settings, raw) => cleanSettings(raw, ["step", "mask", "width"]),
      rules: (settings) => {
        const rules: Rule[] = settings.required
          ? [{ rule: "required", label: "When it's empty" }]
          : [];

        if (settings.pattern)
          rules.push({ rule: "pattern", label: "Wrong format", value: settings.pattern });

        return rules;
      },
    }),
  },
);
