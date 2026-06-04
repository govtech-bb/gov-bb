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
  WebhookProcessor,
  SUBMISSION_PROCESSORS,
} from "./processors";
import { PaymentProcessor } from "./processors/payment/payment.processor";
import { FormDefinitionsModule } from "../form-definitions/form-definitions.module";
import { FormConfigModule } from "../form-config/form-config.module";
import { FormDraftsModule } from "../form-drafts/form-drafts.module";
import { PaymentsModule } from "../../payments/payments.module";
import { FilesModule } from "../../files/files.module";
import { SqsProducerService } from "./sqs/sqs-producer.service";
import { SqsConsumerService } from "./sqs/sqs-consumer.service";
import sqsConfig from "../../config/sqs.config";
import emailConfig from "../../config/email.config";
import { ExpressionsModule } from "../../expressions/expressions.module";
import { EmailTemplateService } from "../../email/email-template.service";
import { EmailBodyBuilder } from "../../email/email-body.builder";

@Module({
  imports: [
    FormDefinitionsModule,
    FormConfigModule,
    FormDraftsModule,
    PaymentsModule,
    FilesModule,
    ConfigModule.forFeature(sqsConfig),
    ConfigModule.forFeature(emailConfig),
    ExpressionsModule,
  ],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    FormSubmissionRepository,
    SubmissionPipelineService,
    EmailTemplateService,
    EmailBodyBuilder,
    // Concrete processor implementations — add new processors here only.
    EmailProcessor,
    OpencrvsProcessor,
    SpreadsheetProcessor,
    PaymentProcessor,
    WebhookProcessor,
    {
      provide: SUBMISSION_PROCESSORS,
      useFactory: (
        email: EmailProcessor,
        opencrvs: OpencrvsProcessor,
        spreadsheet: SpreadsheetProcessor,
        payment: PaymentProcessor,
        webhook: WebhookProcessor,
      ) => [email, opencrvs, spreadsheet, payment, webhook],
      inject: [
        EmailProcessor,
        OpencrvsProcessor,
        SpreadsheetProcessor,
        PaymentProcessor,
        WebhookProcessor,
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
