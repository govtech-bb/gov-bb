import { Module } from "@nestjs/common";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { SubmissionProcessorListener } from "./submission-processor.listener";
import {
  EmailProcessor,
  OpencrvsProcessor,
  ProcessorFactory,
  SUBMISSION_PROCESSORS,
} from "./processors";
import { FormDefinitionsModule } from "../form-definitions/form-definitions.module";
import { FormDraftsModule } from "../form-drafts/form-drafts.module";

@Module({
  imports: [FormDefinitionsModule, FormDraftsModule],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    FormSubmissionRepository,
    SubmissionPipelineService,
    EmailProcessor,
    OpencrvsProcessor,
    {
      provide: SUBMISSION_PROCESSORS,
      useFactory: (email: EmailProcessor, opencrvs: OpencrvsProcessor) => [
        email,
        opencrvs,
      ],
      inject: [EmailProcessor, OpencrvsProcessor],
    },
    ProcessorFactory,
    SubmissionProcessorListener,
  ],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
