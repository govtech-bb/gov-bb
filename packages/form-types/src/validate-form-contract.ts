import {
  serviceContractRecipeSchema,
  type ServiceContractRecipe,
} from "./service-contract.type";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; data: ServiceContractRecipe }
  | { ok: false; issues: ValidationIssue[] };

// Validate an author-time service contract recipe before it's persisted.
// Not wired — call from whatever ingest point lands.
export function validateFormContract(input: unknown): ValidationResult {
  const parsed = serviceContractRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }

  // #771: repeatable min/max are 1-based totals. The parse schema stays
  // lenient (legacy recipe versions must still load); author-time saves are
  // where bad bounds get rejected.
  const issues: ValidationIssue[] = [];
  parsed.data.steps.forEach((step, i) => {
    step.behaviours?.forEach((b, j) => {
      if (b.type !== "repeatable") return;
      const path = (p: string) => `steps.${i}.behaviours.${j}.${p}`;
      if (!Number.isInteger(b.min) || b.min < 1)
        issues.push({
          path: path("min"),
          message: "min must be an integer >= 1 (total instances shown)",
        });
      if (!Number.isInteger(b.max) || b.max < b.min)
        issues.push({
          path: path("max"),
          message: "max must be an integer >= min (total instance cap)",
        });
    });
  });
  return issues.length
    ? { ok: false, issues }
    : { ok: true, data: parsed.data };
}
