import type { Setting, Settings } from "./settings";
import { mapFormulaReferences } from "./formula";

/** Change only known references, never UUID-looking substrings in prose or opaque settings. */
export function remapReference(value: string, aliases: Map<string, string>) {
  if (aliases.has(value)) return aliases.get(value)!;
  const colon = value.indexOf(":");

  return colon > 0 && aliases.has(value.slice(0, colon))
    ? aliases.get(value.slice(0, colon))! + value.slice(colon)
    : value;
}

export type ReferenceContext = {
  choiceFields?: ReadonlySet<string>;
  optionAliases?: ReadonlyMap<string, string>;
  fieldReferences?: (settings: Settings, visit: ReferenceMapper) => Settings;
};

export type SettingsReference = {
  kind: "field" | "option" | "page" | "block";
  value: string;
  path: readonly (string | number)[];
};

type ReferencePath = SettingsReference["path"];

type ReferenceMapper = (reference: SettingsReference) => string;

/** Shared traversal keeps enumeration and copying aligned, including retained inactive action payloads. */
function mapKnownReferences(
  value: Settings,
  visit: ReferenceMapper,
  context: ReferenceContext,
): Settings {
  const result = structuredClone(value);

  const ref = (value: string, path: ReferencePath, kind: SettingsReference["kind"] = "field") =>
    visit({ kind, value, path });

  const optionRef = (value: Setting | undefined, path: ReferencePath) =>
    typeof value === "string" ? ref(value, path, "option") : value;

  const literal = (value: Setting, path: ReferencePath): Setting =>
    value && typeof value === "object" && !Array.isArray(value) && typeof value.field === "string"
      ? { ...value, field: ref(value.field, [...path, "field"]) }
      : value;

  const conditional = (row: Setting, path: ReferencePath): Setting => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const next = { ...row };

    if (typeof row.field === "string") next.field = ref(row.field, [...path, "field"]);

    if (row.value !== undefined) {
      const optionValue =
        row.valueIsLiteral !== true &&
        typeof row.field === "string" &&
        context.choiceFields?.has(row.field)
          ? Array.isArray(row.value)
            ? row.value.map((value, index) => optionRef(value, [...path, "value", index])!)
            : optionRef(row.value, [...path, "value"])
          : undefined;

      next.value = optionValue === undefined ? literal(row.value, [...path, "value"]) : optionValue;
    }

    if (Array.isArray(row.conditionals))
      next.conditionals = row.conditionals.map((child, index) =>
        conditional(child, [...path, "conditionals", index]),
      );

    return next;
  };

  if (Array.isArray(result.conditionals))
    result.conditionals = result.conditionals.map((row, index) =>
      conditional(row, ["conditionals", index]),
    );

  if (Array.isArray(result.actions))
    result.actions = result.actions.map((row, index) => {
      const path = ["actions", index];

      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const next = { ...row };

      for (const name of ["jumpToPage", "requireAnswer"])
        if (typeof next[name] === "string")
          next[name] = ref(next[name], [...path, name], name === "jumpToPage" ? "page" : "field");

      for (const name of ["showBlocks", "hideBlocks"]) {
        const values = next[name];

        if (Array.isArray(values))
          next[name] = values.map((value, index) =>
            typeof value === "string" ? ref(value, [...path, name, index], "block") : value,
          );
      }

      for (const name of ["changeLabel", "changePageTitle"]) {
        const value = next[name];

        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof value.target === "string"
        )
          next[name] = {
            ...value,
            target: ref(
              value.target,
              [...path, name, "target"],
              name === "changePageTitle" ? "page" : "field",
            ),
          };
      }

      if (next.calculate && typeof next.calculate === "object" && !Array.isArray(next.calculate)) {
        const calc = { ...next.calculate };

        if (typeof calc.field === "string")
          calc.field = ref(calc.field, [...path, "calculate", "field"]);

        if (calc.value !== undefined)
          calc.value = literal(calc.value, [...path, "calculate", "value"])!;

        if (typeof calc.expression === "string")
          calc.expression = mapFormulaReferences(calc.expression, (key) =>
            ref(key, [...path, "calculate", "expression"]),
          );
        next.calculate = calc;
      }

      return next;
    });

  if (Array.isArray(result.calculatedFields))
    result.calculatedFields = result.calculatedFields.map((row, index) =>
      row && typeof row === "object" && !Array.isArray(row) && row.value !== undefined
        ? { ...row, value: literal(row.value, ["calculatedFields", index, "value"])! }
        : row,
    );

  if (
    result.applicantEmail &&
    typeof result.applicantEmail === "object" &&
    !Array.isArray(result.applicantEmail) &&
    typeof result.applicantEmail.question === "string"
  )
    result.applicantEmail.question = ref(result.applicantEmail.question, [
      "applicantEmail",
      "question",
    ]);

  for (const property of ["conditionalTitle", "conditionalLabel"]) {
    const rows = result[property];

    if (Array.isArray(rows))
      result[property] = rows.map((row, index) => {
        const path = [property, index];

        if (!row || typeof row !== "object" || Array.isArray(row)) return row;
        const next = { ...row };

        if (typeof next.field === "string") next.field = ref(next.field, [...path, "field"]);

        if (next.value && typeof next.value === "object" && !Array.isArray(next.value)) {
          const value = { ...next.value };

          if (typeof value.option === "string")
            value.option = ref(value.option, [...path, "value", "option"], "option");

          if (Array.isArray(value.options))
            value.options = value.options.map((option, index) =>
              optionRef(option, [...path, "value", "options", index])!,
            );
          next.value = value;
        }

        return next;
      });
  }

  return context.fieldReferences?.(result, visit) ?? result;
}

/** Enumerate only owned references; prose, opaque settings and literal answer values are not references. */
export function referencesInSettings(
  value: Settings,
  context: ReferenceContext = {},
): SettingsReference[] {
  const references: SettingsReference[] = [];
  mapKnownReferences(
    value,
    (reference) => {
      references.push(reference);

      return reference.value;
    },
    context,
  );

  return references;
}

export function remapKnownSettings(
  value: Settings,
  aliases: Map<string, string>,
  context: ReferenceContext = {},
): Settings {
  return mapKnownReferences(
    value,
    ({ kind, value }) =>
      kind === "option"
        ? (context.optionAliases?.get(value) ?? value)
        : remapReference(value, aliases),
    context,
  );
}
