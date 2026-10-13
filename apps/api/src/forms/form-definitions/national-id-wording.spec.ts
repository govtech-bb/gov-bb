import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { NATIONAL_ID_FORMAT, NATIONAL_ID_LABEL } from "@govtech-bb/registry";
import { getCatalog, hydrateForm } from "@govtech-bb/form-builder";

// One name for one document (#2732). A Barbados ID field was labelled nine
// ways across the forms, its required error worded seventeen ways, and its
// hint example given as four different numbers, so a resident met a new name
// for the same card on every service. The registry now owns the name
// (NATIONAL_ID_LABEL); this keeps recipes from drifting away from it again.
//
// A field counts as asking for a Barbados ID when it carries the registry's
// mask, or any pattern that accepts an ID: that is how the component (directly
// or via a block) arrives after hydration, and it also catches a recipe that
// restates the pattern in its own words. Plain-text fields that ask for the
// same number are pinned by id below, so they stay checked if they lose it.
const RECIPES_DIR = path.resolve(__dirname, "recipes");

const CHILD_LABEL = `Child's ${NATIONAL_ID_LABEL}`;
const SPECIMEN = "850101-0001";
// The card itself, as a hint may point at it ("you can find this on…").
const CARD_NAME = "Barbados National Identification (ID) card";

/** Plain-text fields that ask for a Barbados ID without the component. */
const GENERIC_NATIONAL_ID_FIELDS = [
  "school-uniform-grant-barbados/parent-national-id",
  "seniors-recreational-activities-programme/national-registration-number",
  "smart-stream-vendor-registration/nrn",
];

// Other names this document has gone by. Checked in hints once the
// canonical label and card name have been taken out.
const OTHER_NAMES =
  /national\s+(id|identification|registration)|\bNRN\b|\bID\s+number\b/i;

type Rule = { value?: unknown; error?: string };
type HydratedField = {
  fieldId: string;
  mask?: string;
  label?: string;
  hint?: string;
  options?: { label?: string }[];
  validations?: { required?: Rule; pattern?: Rule } & Record<string, Rule>;
};
type HydratedStep = { stepId: string; elements?: HydratedField[] };

/** True when `text` calls the document something other than its one name. */
function namesItAnotherWay(text: string): boolean {
  const rest = [CHILD_LABEL, NATIONAL_ID_LABEL, CARD_NAME].reduce(
    (t, name) => t.split(name).join(""),
    text,
  );
  return OTHER_NAMES.test(rest);
}

/** True when a field's mask or pattern means it takes a Barbados ID. */
export function hasIdFormat(field: HydratedField): boolean {
  if (field.mask === NATIONAL_ID_FORMAT.mask) return true;
  const pattern = field.validations?.pattern?.value;
  if (typeof pattern !== "string") return false;
  try {
    // Accepts an ID but not a letter in it, so a looser pattern (a licence or
    // business name) that happens to accept one isn't mistaken for an ID one.
    // Unanchored restatements (\d{6}-\d{4}) still count, and then fail the
    // check against the registry's pattern.
    const re = new RegExp(pattern);
    return re.test(SPECIMEN) && !re.test("A50101-0001");
  } catch {
    return false;
  }
}

/**
 * The other fields on a step that asks for the ID, such as the "use passport
 * number instead" toggle, mustn't call it something else a line below it.
 */
export function checkNeighbourWording(
  where: string,
  field: HydratedField,
): string[] {
  const texts = [
    field.label,
    field.hint,
    ...(field.options ?? []).map((o) => o.label),
    ...Object.values(field.validations ?? {}).map((r) => r.error),
  ];
  return texts
    .filter((t): t is string => typeof t === "string" && namesItAnotherWay(t))
    .map((t) => `${where}: "${t}" names the ID another way`);
}

/** Human-readable problems for one national ID field ([] means it agrees). */
export function checkNationalIdWording(
  where: string,
  field: HydratedField,
  { idFormat }: { idFormat: boolean },
): string[] {
  const problems: string[] = [];
  const { label, hint, validations } = field;

  if (label !== NATIONAL_ID_LABEL && label !== CHILD_LABEL) {
    problems.push(
      `${where}: label "${label}" should be "${NATIONAL_ID_LABEL}" ` +
        `(delete the label override to inherit it) or "${CHILD_LABEL}"`,
    );
  }
  const required = validations?.required;
  if (required?.value === true && required.error !== `${label} is required`) {
    problems.push(
      `${where}: required error "${required.error}" should be "${label} is required"`,
    );
  }
  if (
    idFormat &&
    (validations?.pattern?.value !== NATIONAL_ID_FORMAT.pattern ||
      validations?.pattern?.error !== NATIONAL_ID_FORMAT.error)
  ) {
    problems.push(
      `${where}: pattern "${validations?.pattern?.value}" / "${validations?.pattern?.error}" should be the registry's ` +
        `(delete the pattern override to inherit it)`,
    );
  }
  for (const [rule, { error }] of Object.entries(validations ?? {})) {
    if (error && namesItAnotherWay(error)) {
      problems.push(
        `${where}: ${rule} error "${error}" names the ID another way`,
      );
    }
  }
  if (hint) {
    if (namesItAnotherWay(hint)) {
      problems.push(`${where}: hint "${hint}" names the ID another way`);
    }
    const specimens = hint.match(/\d{6}-\d{4}/g) ?? [];
    if (specimens.some((s) => s !== SPECIMEN)) {
      problems.push(
        `${where}: hint "${hint}" should use ${SPECIMEN} as its example`,
      );
    }
  }
  return problems;
}

async function hydratedRecipes(): Promise<
  { formId: string; steps: HydratedStep[] }[]
> {
  const files = (await fs.readdir(RECIPES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const raw = JSON.parse(
        await fs.readFile(path.join(RECIPES_DIR, file), "utf8"),
      );
      const recipe = serviceContractRecipeSchema.parse(raw);
      const hydrated = await hydrateForm(recipe, getCatalog());
      return {
        formId: file.replace(/\.json$/, ""),
        steps: hydrated.steps as unknown as HydratedStep[],
      };
    }),
  );
}

it("every Barbados ID field uses the one name, error wording and example number", async () => {
  const recipes = await hydratedRecipes();
  expect(recipes.length).toBeGreaterThan(50);

  const problems: string[] = [];
  let idFormatFields = 0;
  const genericSeen = new Set<string>();
  for (const { formId, steps } of recipes) {
    for (const step of steps) {
      const fields = step.elements ?? [];
      const isIdField = (field: HydratedField) =>
        hasIdFormat(field) ||
        GENERIC_NATIONAL_ID_FIELDS.includes(`${formId}/${field.fieldId}`);
      // Neighbours are the step's own fields (where the passport toggle
      // sits); no ID field is inside a repeatable today.
      const stepAsksForId = fields.some(isIdField);
      for (const field of fields) {
        const where = `${formId} › ${step.stepId} › ${field.fieldId}`;
        if (!isIdField(field)) {
          if (stepAsksForId)
            problems.push(...checkNeighbourWording(where, field));
          continue;
        }
        const idFormat = hasIdFormat(field);
        if (idFormat) idFormatFields++;
        if (GENERIC_NATIONAL_ID_FIELDS.includes(`${formId}/${field.fieldId}`)) {
          genericSeen.add(`${formId}/${field.fieldId}`);
        }
        problems.push(...checkNationalIdWording(where, field, { idFormat }));
      }
    }
  }

  // Can't pass vacuously: if hydration stops carrying the pattern, or a pinned
  // field is renamed, this fails instead of checking nothing.
  // 51 on 2026-10-12: 44 direct component refs, 5 personal-information and
  // 1 proving-your-identity blocks, and Smart Stream's patterned plain field.
  expect(idFormatFields).toBeGreaterThanOrEqual(51);
  expect([...genericSeen].sort()).toEqual(
    [...GENERIC_NATIONAL_ID_FIELDS].sort(),
  );
  expect(problems).toEqual([]);
});

describe("checkNeighbourWording", () => {
  it("catches a passport toggle that still uses the old name", () => {
    expect(
      checkNeighbourWording("f", {
        fieldId: "passport-toggle",
        label: "Use passport number instead",
        hint: "If you don't have a National ID number, use your passport number.",
      })[0],
    ).toContain("names the ID another way");
  });

  it("passes a neighbour that uses the one name, or doesn't mention it", () => {
    expect(
      checkNeighbourWording("f", {
        fieldId: "passport-toggle",
        label: "Use passport number instead",
        hint: `If you don't have a ${NATIONAL_ID_LABEL}, use your passport number.`,
      }),
    ).toEqual([]);
  });
});

describe("hasIdFormat", () => {
  it("recognises the mask, the registry pattern and a restated one", () => {
    expect(hasIdFormat({ fieldId: "a", mask: "999999-9999" })).toBe(true);
    expect(
      hasIdFormat({
        fieldId: "a",
        validations: { pattern: { value: "^[0-9]{6}-[0-9]{4}$" } },
      }),
    ).toBe(true);
    expect(
      hasIdFormat({
        fieldId: "a",
        validations: { pattern: { value: "^\\d{6}$" } },
      }),
    ).toBe(false);
    expect(
      hasIdFormat({
        fieldId: "licence",
        validations: { pattern: { value: "^[A-Za-z0-9 -]+$" } },
      }),
    ).toBe(false);
    expect(
      hasIdFormat({
        fieldId: "a",
        validations: { pattern: { value: "\\d{6}-\\d{4}" } },
      }),
    ).toBe(true);
  });
});

describe("checkNationalIdWording", () => {
  const ok: HydratedField = {
    fieldId: "national-id-number",
    label: NATIONAL_ID_LABEL,
    hint: `For example, ${SPECIMEN}`,
    validations: {
      required: { value: true, error: `${NATIONAL_ID_LABEL} is required` },
      pattern: {
        value: NATIONAL_ID_FORMAT.pattern,
        error: NATIONAL_ID_FORMAT.error,
      },
    },
  };
  const check = (field: HydratedField) =>
    checkNationalIdWording("f", field, { idFormat: true });

  it("passes the canonical field and the child variant", () => {
    expect(check(ok)).toEqual([]);
    expect(
      check({
        ...ok,
        label: CHILD_LABEL,
        validations: {
          ...ok.validations,
          required: { value: true, error: `${CHILD_LABEL} is required` },
        },
      }),
    ).toEqual([]);
  });

  it("catches a label differing only by case", () => {
    expect(
      check({
        ...ok,
        label: "Barbados National Identification (ID) Number",
      })[0],
    ).toContain("label");
  });

  it("catches a required error that names the field another way", () => {
    expect(
      check({
        ...ok,
        validations: {
          ...ok.validations,
          required: { value: true, error: "ID Number is required" },
        },
      })[0],
    ).toContain("required error");
  });

  it("catches another name in any other validation error", () => {
    expect(
      check({
        ...ok,
        validations: {
          ...ok.validations,
          minLength: {
            value: 2,
            error: "National ID must be at least 2 characters",
          },
        },
      })[0],
    ).toContain("minLength error");
  });

  it("ignores the error of a field that isn't required", () => {
    expect(
      check({
        ...ok,
        validations: { ...ok.validations, required: { value: false } },
      }),
    ).toEqual([]);
  });

  it("catches an overridden pattern error", () => {
    expect(
      check({
        ...ok,
        validations: {
          ...ok.validations,
          pattern: {
            value: NATIONAL_ID_FORMAT.pattern,
            error: "Enter a valid ID number (for example, 850101-0001)",
          },
        },
      })[0],
    ).toContain("should be the registry's");
    // An equivalent regex restated by a recipe still drifts from the registry.
    expect(
      check({
        ...ok,
        validations: {
          ...ok.validations,
          pattern: {
            value: "^[0-9]{6}-[0-9]{4}$",
            error: NATIONAL_ID_FORMAT.error,
          },
        },
      })[0],
    ).toContain("should be the registry's");
  });

  it("catches another name or example number in the hint, but keeps useful hints", () => {
    expect(
      check({ ...ok, hint: "Your National Registration Number" })[0],
    ).toContain("names the ID another way");
    expect(check({ ...ok, hint: "For example, 450702-0130" })[0]).toContain(
      `use ${SPECIMEN}`,
    );
    expect(check({ ...ok, hint: "Enter only if known" })).toEqual([]);
    expect(check({ ...ok, hint: "Format: YYMMDD-XXXX" })).toEqual([]);
    expect(
      check({ ...ok, hint: `You can find this on your ${CARD_NAME}.` }),
    ).toEqual([]);
    expect(
      check({ ...ok, hint: "You can find this on your national ID card." })[0],
    ).toContain("names the ID another way");
  });
});
