import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { FormSubmissionRepository } from './form-submission.repository';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService, FormSubmissionRepository],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
