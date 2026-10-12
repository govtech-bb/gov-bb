import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import {
  BUILTIN_REGISTRY,
  NATIONAL_ID_FORMAT,
  NATIONAL_ID_LABEL,
} from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// One name for one document (#2732). A Barbados ID field was labelled nine
// ways across the forms, its required error worded seventeen ways, and its
// hint example given as four different numbers, so a resident met a new name
// for the same card on every service. The registry now owns the name
// (NATIONAL_ID_LABEL); this keeps recipes from drifting away from it again.
//
// A field counts as asking for a Barbados ID when it carries the registry's
// mask or pattern, which is how the component (directly or via a block)
// arrives after hydration. Two older plain-text fields ask for the same number
// with neither; they are pinned by id below.
const RECIPES_DIR = path.resolve(__dirname, "recipes");

const CHILD_LABEL = `Child's ${NATIONAL_ID_LABEL}`;
const SPECIMEN = "850101-0001";
// The card itself, as a hint may point at it ("you can find this on…").
const CARD_NAME = "Barbados National Identification (ID) card";

/** Plain-text fields that ask for a Barbados ID without the component. */
const GENERIC_NATIONAL_ID_FIELDS = [
  "school-uniform-grant-barbados/parent-national-id",
  "seniors-recreational-activities-programme/national-registration-number",
];

// Other names this document has gone by. Checked in hints once the
// canonical label and card name have been taken out.
const OTHER_NAMES =
  /national\s+(id|identification|registration)|\bNRN\b|\bID\s+number\b/i;

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

type Rule = { value?: unknown; error?: string };
type HydratedField = {
  fieldId: string;
  mask?: string;
  label?: string;
  hint?: string;
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

/** Human-readable problems for one national ID field ([] means it agrees). */
export function checkNationalIdWording(
  where: string,
  field: HydratedField,
  { hasIdFormat }: { hasIdFormat: boolean },
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
    hasIdFormat &&
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
      const hydrated = await hydrateForm(recipe, resolver);
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
      for (const field of step.elements ?? []) {
        const where = `${formId} › ${step.stepId} › ${field.fieldId}`;
        const hasIdFormat =
          field.mask === NATIONAL_ID_FORMAT.mask ||
          field.validations?.pattern?.value === NATIONAL_ID_FORMAT.pattern;
        const generic = GENERIC_NATIONAL_ID_FIELDS.includes(
          `${formId}/${field.fieldId}`,
        );
        if (!hasIdFormat && !generic) continue;
        if (hasIdFormat) idFormatFields++;
        if (generic) genericSeen.add(`${formId}/${field.fieldId}`);
        problems.push(...checkNationalIdWording(where, field, { hasIdFormat }));
      }
    }
  }

  // Can't pass vacuously: if hydration stops carrying the pattern, or a pinned
  // field is renamed, this fails instead of checking nothing.
  expect(idFormatFields).toBeGreaterThanOrEqual(51);
  expect([...genericSeen].sort()).toEqual(
    [...GENERIC_NATIONAL_ID_FIELDS].sort(),
  );
  expect(problems).toEqual([]);
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
    checkNationalIdWording("f", field, { hasIdFormat: true });

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
