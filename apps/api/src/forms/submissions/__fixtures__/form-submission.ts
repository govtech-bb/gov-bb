import {
  FormSubmissionStatus,
  type FormSubmissionEntity,
} from "@/database/entities/form-submission.entity";

/**
 * A submitted FormSubmissionEntity for tests, with sensible defaults overridable
 * per case. Shared by the submissions specs (controller unit, controller HTTP,
 * service) so the fixture shape lives in one place. Includes `referenceCode`;
 * consumers that don't care about it simply ignore it.
 */
export function makeSubmissionEntity(
  overrides: Partial<FormSubmissionEntity> = {},
): FormSubmissionEntity {
  return {
    id: "uuid-sub-1",
    idempotencyKey: "key-abc",
    referenceCode: "TF-2606-ABCDEFG",
    formId: "test-form",
    formVersion: "1.0.0",
    status: FormSubmissionStatus.SUBMITTED,
    values: { "step-1": { field1: "value1" } },
    meta: null,
    submittedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  } as FormSubmissionEntity;
}
