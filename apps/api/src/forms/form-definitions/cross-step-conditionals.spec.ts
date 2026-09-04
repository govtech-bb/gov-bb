import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// A condition that names a field on ANOTHER step must say so with
// `targetStepId`. The client defaults an absent `targetStepId` to the field's
// own step (`checkConditionalOn` in apps/forms), so a cross-step condition
// without it resolves against a step that does not hold the field and the
// question is never asked. The API's evaluator falls back to a flat whole-form
// lookup instead, so the two sides disagree: the renderer never shows the
// question while the server still counts it. Nothing errors, so nothing goes
// red — the form simply stops asking something, quietly, in production.
//
// This has now been fixed one form at a time at least three times (#2427, and
// twice inside the 2026-09-04 publish PRs), each with its own hand-written
// per-form assertion naming exact step and field ids. Those locks break on any
// rename, which is how one of them came to be silently repointed at a different
// question during a publish fix — the protection was dropped without anyone
// deciding to drop it.
//
// So this checks the *class* across every recipe instead: whatever a condition
// points at, the step it resolves to must actually contain that field. Renaming
// a step or a field cannot break this spec; only breaking the link can. Same
// shape as `mapped-webhook-applicant-paths.spec.ts`, and for the same reason —
// path-level existence needs registry-ref expansion, so the file-level lint in
// `scripts/validate-recipes.ts` cannot see it.
const RECIPES_DIR = path.resolve(__dirname, "recipes");

/** Behaviour types that point at another field, and so can point at nothing. */
const TARGETING_BEHAVIOURS = new Set([
  "fieldConditionalOn",
  "stepConditionalOn",
  "optionalIf",
]);

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

type Behaviour = {
  type: string;
  targetFieldId?: string;
  targetStepId?: string;
};
type HydratedField = { fieldId: string; behaviours?: Behaviour[] };
type HydratedStep = {
  stepId: string;
  behaviours?: Behaviour[];
  elements?: HydratedField[];
};

/**
 * Every targeting behaviour in one recipe, paired with the step it sits on —
 * which is the step an absent `targetStepId` resolves to.
 */
function targetingBehaviours(
  steps: HydratedStep[],
): { ownStepId: string; behaviour: Behaviour }[] {
  const found: { ownStepId: string; behaviour: Behaviour }[] = [];
  for (const step of steps) {
    const onStep = [
      ...(step.behaviours ?? []),
      ...(step.elements ?? []).flatMap((e) => e.behaviours ?? []),
    ];
    for (const behaviour of onStep) {
      if (!TARGETING_BEHAVIOURS.has(behaviour.type)) continue;
      if (typeof behaviour.targetFieldId !== "string") continue;
      found.push({ ownStepId: step.stepId, behaviour });
    }
  }
  return found;
}

/** Human-readable problems for one recipe ([] means every link resolves). */
export function checkCrossStepConditionals(
  formId: string,
  steps: HydratedStep[],
): string[] {
  const fieldsByStep = new Map(
    steps.map((s) => [
      s.stepId,
      new Set((s.elements ?? []).map((e) => e.fieldId)),
    ]),
  );

  const problems: string[] = [];
  for (const { ownStepId, behaviour } of targetingBehaviours(steps)) {
    // An absent targetStepId means "my own step" — that default is the whole
    // failure mode, so resolve it here rather than skipping these.
    const resolvedStepId = behaviour.targetStepId ?? ownStepId;
    const target = `"${resolvedStepId}.${behaviour.targetFieldId}"`;
    const where = `${formId}: ${behaviour.type} on step "${ownStepId}" points at ${target}`;

    const fields = fieldsByStep.get(resolvedStepId);
    if (!fields) {
      problems.push(`${where} — no step "${resolvedStepId}" in this form`);
      continue;
    }
    if (!fields.has(behaviour.targetFieldId!)) {
      problems.push(
        behaviour.targetStepId === undefined
          ? `${where} — step "${ownStepId}" has no field "${behaviour.targetFieldId}". ` +
              `If it lives on another step, the behaviour needs targetStepId; without it the question is never asked.`
          : `${where} — that step has no field "${behaviour.targetFieldId}"`,
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

it("every condition points at a field the step it resolves to actually has", async () => {
  const recipes = await hydratedRecipes();
  expect(recipes.length).toBeGreaterThan(50);

  // Cannot pass vacuously: if the walk ever stops finding behaviours (a shape
  // change in hydrateForm, a renamed behaviour type), this fails rather than
  // silently checking nothing — the failure mode of the guard behind #504.
  const checked = recipes.flatMap((r) => targetingBehaviours(r.steps)).length;
  expect(checked).toBeGreaterThan(300);

  const problems = recipes.flatMap((r) =>
    checkCrossStepConditionals(r.formId, r.steps),
  );
  expect(problems).toEqual([]);
});

describe("checkCrossStepConditionals", () => {
  const steps: HydratedStep[] = [
    { stepId: "about-you", elements: [{ fieldId: "completing-for" }] },
    {
      stepId: "documents",
      elements: [
        {
          fieldId: "marriage-certificate",
          behaviours: [
            {
              type: "fieldConditionalOn",
              targetStepId: "about-you",
              targetFieldId: "completing-for",
            },
          ],
        },
      ],
    },
  ];

  it("passes a cross-step condition that names its step", () => {
    expect(checkCrossStepConditionals("f", steps)).toEqual([]);
  });

  it("catches a cross-step condition with no targetStepId", () => {
    const broken = structuredClone(steps);
    delete broken[1].elements![0].behaviours![0].targetStepId;
    const problems = checkCrossStepConditionals("f", broken);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("needs targetStepId");
  });

  it("catches a condition naming a step the form does not have", () => {
    const broken = structuredClone(steps);
    broken[1].elements![0].behaviours![0].targetStepId = "nowhere";
    expect(checkCrossStepConditionals("f", broken)[0]).toContain(
      'no step "nowhere"',
    );
  });

  it("catches a condition naming a real step that lacks the field", () => {
    const broken = structuredClone(steps);
    broken[1].elements![0].behaviours![0].targetFieldId = "not-a-field";
    expect(checkCrossStepConditionals("f", broken)[0]).toContain(
      'that step has no field "not-a-field"',
    );
  });

  it("ignores behaviours that point at nothing", () => {
    const other: HydratedStep[] = [
      {
        stepId: "a",
        elements: [{ fieldId: "x", behaviours: [{ type: "fieldArray" }] }],
      },
    ];
    expect(checkCrossStepConditionals("f", other)).toEqual([]);
  });

  // 249 of the 408 conditions in the recipes today omit targetStepId because
  // they genuinely point at their own step. Flagging those would make the guard
  // useless, so it is worth pinning explicitly rather than inferring it from
  // the real-recipes test passing.
  it("passes a same-step condition that omits targetStepId", () => {
    const sameStep: HydratedStep[] = [
      {
        stepId: "a",
        elements: [
          { fieldId: "x" },
          {
            fieldId: "y",
            behaviours: [{ type: "fieldConditionalOn", targetFieldId: "x" }],
          },
        ],
      },
    ];
    expect(checkCrossStepConditionals("f", sameStep)).toEqual([]);
  });

  // A step gate lives on the step, not on a field, so the walk has to read
  // `step.behaviours` too — missing that half would silently skip all 47
  // stepConditionalOn behaviours in the recipes.
  it("checks step-level gates, not only field-level ones", () => {
    const stepGate: HydratedStep[] = [
      { stepId: "a", elements: [{ fieldId: "x" }] },
      {
        stepId: "b",
        behaviours: [
          {
            type: "stepConditionalOn",
            targetStepId: "a",
            targetFieldId: "not-there",
          },
        ],
      },
    ];
    expect(checkCrossStepConditionals("f", stepGate)).toHaveLength(1);
  });
});
