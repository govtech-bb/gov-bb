import { HttpStatus, Injectable } from '@nestjs/common';
import { FormSubmissionStatus } from '../../database/entities/form-submission.entity';
import { AppError } from '../../common/errors';
import { FormSubmissionRepository } from './form-submission.repository';
import type { SubmitDto, SubmitResult } from './submissions.types';

@Injectable()
export class SubmissionsService {
  constructor(private readonly submissionRepo: FormSubmissionRepository) {}

  async submit(dto: SubmitDto): Promise<SubmitResult> {
    const { idempotencyKey, formId, formVersion, values, meta } = dto;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw AppError.badRequest('Idempotency-Key header is required');
    }

    return this.submissionRepo.tx(async (repo) => {
      const existing = await repo.findOne({
        where: { idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        const isProcessing = existing.status === FormSubmissionStatus.PROCESSING;
        return {
          outcome: isProcessing ? 'in_progress' : 'duplicate',
          data: existing,
          message: isProcessing ? 'Submission is currently being processed' : 'Submission already exists',
          statusCode: isProcessing ? HttpStatus.ACCEPTED : HttpStatus.OK,
        };
      }

      const entity = repo.create({
        idempotencyKey,
        formId,
        formVersion,
        values,
        meta: meta ?? null,
        status: FormSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      });

      const saved = await repo.save(entity);

      return {
        outcome: 'created',
        data: saved,
        message: 'Submission created',
        statusCode: HttpStatus.CREATED,
      };
    });
  }
}
