import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormSubmissionEntity, FormSubmissionStatus } from '../../database/entities/form-submission.entity';
import { AppError } from '../../common/errors';
import type { SubmitDto, SubmitResult } from './submissions.types';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(FormSubmissionEntity)
    private readonly submissionRepo: Repository<FormSubmissionEntity>,
  ) {}

  async submit(dto: SubmitDto): Promise<SubmitResult> {
    const { idempotencyKey, formId, formVersion, values, meta } = dto;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw AppError.badRequest('Idempotency-Key header is required');
    }

    const existing = await this.submissionRepo.findOne({ where: { idempotencyKey } });

    if (existing) {
      const isProcessing = existing.status === FormSubmissionStatus.PROCESSING;
      return {
        outcome: isProcessing ? 'in_progress' : 'duplicate',
        data: existing,
        message: isProcessing ? 'Submission is currently being processed' : 'Submission already exists',
        statusCode: isProcessing ? HttpStatus.ACCEPTED : HttpStatus.OK,
      };
    }

    const entity = this.submissionRepo.create({
      idempotencyKey,
      formId,
      formVersion,
      values,
      meta: meta ?? null,
      status: FormSubmissionStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    const saved = await this.submissionRepo.save(entity);

    return {
      outcome: 'created',
      data: saved,
      message: 'Submission created',
      statusCode: HttpStatus.CREATED,
    };
  }
}
