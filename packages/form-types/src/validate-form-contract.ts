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
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}
