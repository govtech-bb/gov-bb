import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";

// Guards the invariants RecipeFileLoaderService enforces at boot
// (onModuleInit -> loadAll). A violation throws there and aborts NestJS
// bootstrap, which on ECS means the task never goes healthy and the deploy
// is rolled back by the circuit breaker. The CI build/test gate does NOT
// boot the API, so without this test a bad recipe ships undetected. See #222.
const RECIPES_ROOT = path.resolve(__dirname, "recipes");

it("every recipe's formId matches its directory and filename matches its version", async () => {
  const problems: string[] = [];

  const formDirs = (await fs.readdir(RECIPES_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const parsed = serviceContractRecipeSchema.parse(
        JSON.parse(await fs.readFile(path.join(dir, file), "utf8")),
      );
      if (parsed.formId !== formId) {
        problems.push(`${formId}/${file}: formId "${parsed.formId}" != dir`);
      }
      const filenameVersion = file.replace(/\.json$/, "");
      if (filenameVersion !== parsed.version) {
        problems.push(
          `${formId}/${file}: filename "${filenameVersion}" != version "${parsed.version}"`,
        );
      }
    }
  }

  expect(problems).toEqual([]);
});

// A required National ID field next to a "use passport number instead"
// show-hide toggle must relax its required validation when the toggle is on
// (optionalIf), or a citizen without a National ID can never submit. See #761.
// Only the latest version of each recipe is checked — older pinned versions
// predate the optionalIf behaviour and are left untouched.
it("latest recipes pair passport show-hide toggles with optionalIf on the National ID field", async () => {
  type Behaviour = { type: string; targetFieldId?: string };
  type Element = {
    ref?: string;
    overrides?: {
      fieldId?: string;
      label?: string;
      hint?: string;
      behaviours?: Behaviour[];
      validations?: { required?: { value?: boolean } };
    };
  };
  type Step = { stepId: string; elements?: Element[] };

  const semverDesc = (a: string, b: string) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
  };

  const problems: string[] = [];

  const formDirs = (await fs.readdir(RECIPES_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const versions = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort(semverDesc);
    if (versions.length === 0) continue;
    const latest = `${versions[0]}.json`;

    const recipe = serviceContractRecipeSchema.parse(
      JSON.parse(await fs.readFile(path.join(dir, latest), "utf8")),
    ) as { steps: Step[] };

    for (const step of recipe.steps) {
      const elements = step.elements ?? [];
      const passportToggleIds = elements
        .filter(
          (e) =>
            e.ref === "components/show-hide" &&
            /passport/i.test(
              `${e.overrides?.label ?? ""} ${e.overrides?.hint ?? ""}`,
            ),
        )
        .map((e) => e.overrides?.fieldId)
        .filter((id): id is string => Boolean(id));
      if (passportToggleIds.length === 0) continue;

      for (const e of elements) {
        if (e.ref !== "components/national-id-number") continue;
        if (e.overrides?.validations?.required?.value !== true) continue;
        const optionalIfTargets = (e.overrides?.behaviours ?? [])
          .filter((b) => b.type === "optionalIf")
          .map((b) => b.targetFieldId);
        if (
          !optionalIfTargets.some((t) => t && passportToggleIds.includes(t))
        ) {
          problems.push(
            `${formId}/${latest}: step "${step.stepId}" field "${e.overrides?.fieldId}" is required next to passport toggle(s) [${passportToggleIds.join(", ")}] but has no optionalIf targeting one`,
          );
        }
      }
    }
  }

  expect(problems).toEqual([]);
});
