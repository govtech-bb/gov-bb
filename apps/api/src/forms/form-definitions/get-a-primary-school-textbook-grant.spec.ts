import * as fs from "node:fs/promises";
import * as path from "node:path";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// Each child on the repeatable `child-details` step must answer its own
// follow-ups (same bug class as #2856). The passport and relationship
// conditions used to carry `"targetStepId": "child-details"`, which pins them
// to the FIRST child: the server's evaluator reads
// `values["child-details"][0]`, and the forms app only rewrites an absent
// targetStepId to each copy's own step. So child 2's passport number and
// relationship description followed child 1's answers. This hydrates the real
// recipe and evaluates the conditions the submission pipeline validates
// against.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/get-a-primary-school-textbook-grant.json",
);

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

async function contract(): Promise<ServiceContract> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  return (await hydrateForm(recipe, resolver)) as unknown as ServiceContract;
}

/** Per child: which follow-ups are shown and whether the ID is optional. */
async function perChild(children: Record<string, unknown>[]) {
  const cond = evaluateFormConditions(await contract(), {
    "child-details": children,
  });
  const active = cond.activeFieldsByInstance.get("child-details");
  const optional = cond.optionalFieldsByInstance.get("child-details");
  expect(active, "child-details has no per-instance result").toBeDefined();
  return active!.map((fields, i) => ({
    passportAsked: fields.has("child-passport-number"),
    idOptional: optional![i].has("child-id-number"),
    relationshipAsked: fields.has("relationship-description"),
  }));
}

it("pins no condition on child-details to child-details itself", async () => {
  const step = (await contract()).steps.find(
    (s) => s.stepId === "child-details",
  )!;
  const pinned = step.elements.flatMap((p) =>
    (p.behaviours ?? [])
      .filter((b) => "targetStepId" in b && b.targetStepId === "child-details")
      .map(() => p.fieldId),
  );
  expect(pinned).toEqual([]);
});

it("follows each child's own passport toggle", async () => {
  expect(
    await perChild([
      { "child-passport-toggle": false },
      { "child-passport-toggle": true },
    ]),
  ).toEqual([
    { passportAsked: false, idOptional: false, relationshipAsked: false },
    { passportAsked: true, idOptional: true, relationshipAsked: false },
  ]);
});

it("asks only the child whose applicant is not the parent to describe the relationship", async () => {
  expect(
    await perChild([
      { "is-parent-or-guardian": "yes" },
      { "is-parent-or-guardian": "no" },
    ]),
  ).toEqual([
    { passportAsked: false, idOptional: false, relationshipAsked: false },
    { passportAsked: false, idOptional: false, relationshipAsked: true },
  ]);
});
