import type { FormSubmissionEntity } from '../../database/entities/form-submission.entity';

export interface SubmitDto {
  idempotencyKey: string;
  formId: string;
  formVersion: string;
  values: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type SubmitOutcome = 'created' | 'duplicate' | 'in_progress';

export interface SubmitResult {
  outcome: SubmitOutcome;
  data: FormSubmissionEntity;
  message: string;
  statusCode: number;
}
