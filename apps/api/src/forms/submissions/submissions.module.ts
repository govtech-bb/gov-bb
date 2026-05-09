import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { SubmissionProcessorListener } from "./submission-processor.listener";
import {
  EmailProcessor,
  OpencrvsProcessor,
  ProcessorFactory,
  SpreadsheetProcessor,
  SUBMISSION_PROCESSORS,
} from "./processors";
import { PaymentProcessor } from "./processors/payment/payment.processor";
import { FormDefinitionsModule } from "../form-definitions/form-definitions.module";
import { FormDraftsModule } from "../form-drafts/form-drafts.module";
import { PaymentsModule } from "../../payments/payments.module";
import { SqsProducerService } from "./sqs/sqs-producer.service";
import { SqsConsumerService } from "./sqs/sqs-consumer.service";
import sqsConfig from "../../config/sqs.config";
import { ExpressionsModule } from "../../expressions/expressions.module";
import { EmailTemplateService } from "../../email/email-template.service";

@Module({
  imports: [
    FormDefinitionsModule,
    FormDraftsModule,
    PaymentsModule,
    ConfigModule.forFeature(sqsConfig),
    ExpressionsModule,
  ],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    FormSubmissionRepository,
    SubmissionPipelineService,
    EmailTemplateService,
    // Concrete processor implementations — add new processors here only.
    EmailProcessor,
    OpencrvsProcessor,
    SpreadsheetProcessor,
    PaymentProcessor,
    {
      provide: SUBMISSION_PROCESSORS,
      useFactory: (
        email: EmailProcessor,
        opencrvs: OpencrvsProcessor,
        spreadsheet: SpreadsheetProcessor,
        payment: PaymentProcessor,
      ) => [email, opencrvs, spreadsheet, payment],
      inject: [
        EmailProcessor,
        OpencrvsProcessor,
        SpreadsheetProcessor,
        PaymentProcessor,
      ],
    },
    ProcessorFactory,
    SqsProducerService,
    SqsConsumerService,
    SubmissionProcessorListener,
  ],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
