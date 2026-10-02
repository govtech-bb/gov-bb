import * as fs from "node:fs/promises";
import * as path from "node:path";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import {
  serviceContractRecipeSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// Each pool on the repeatable `pool-details` step must answer its own "Other"
// follow-up (#2856). The `other-pool` condition used to carry
// `"targetStepId": "pool-details"`, which pins it to the FIRST pool: the
// server's evaluator reads `values["pool-details"][0]`, and the forms app
// only rewrites an absent targetStepId to each copy's own step. So pool 2
// asked for (and required) a description because pool 1 ticked "Other", and
// pool 2's own "Other" was never followed up. This hydrates the real recipe
// and evaluates the conditions the submission pipeline validates against.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/apply-for-swimming-pool-licence.json",
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

/** Whether each pool is asked to describe its "Other" use. */
async function otherPoolAskedPerPool(usages: string[][]): Promise<boolean[]> {
  const cond = evaluateFormConditions(await contract(), {
    "pool-details": usages.map((u) => ({ "pool-usage-type": u })),
  });
  const instances = cond.activeFieldsByInstance.get("pool-details");
  expect(instances, "pool-details has no per-instance result").toBeDefined();
  return instances!.map((active) => active.has("other-pool"));
}

it("asks only pool 1 to describe its use when only pool 1 ticks Other", async () => {
  expect(await otherPoolAskedPerPool([["other"], ["hotel"]])).toEqual([
    true,
    false,
  ]);
});

it("asks only pool 2 to describe its use when only pool 2 ticks Other", async () => {
  expect(await otherPoolAskedPerPool([["hotel"], ["school", "other"]])).toEqual(
    [false, true],
  );
});
