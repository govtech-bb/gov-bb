import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { FormSubmissionRepository } from "./form-submission.repository";
import { NotificationLogRepository } from "./notification-log.repository";
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
import { PaymentsModule } from "@/payments/payments.module";
import { FilesModule } from "@/files/files.module";
import { SqsProducerService } from "./sqs/sqs-producer.service";
import { SqsConsumerService } from "./sqs/sqs-consumer.service";
import { SesEventConsumerService } from "./sqs/ses-event-consumer.service";
import sqsConfig from "@/config/sqs.config";
import sesEventsConfig from "@/config/ses-events.config";
import { ExpressionsModule } from "@/expressions/expressions.module";
import { EmailTemplateService } from "@/email/email-template.service";
import { EmailBodyBuilder } from "@/email/email-body.builder";
import { SesMailer } from "@/email/ses-mailer";
import { PaymentRequiredListener } from "@/email/payment-required.listener";

@Module({
  imports: [
    HttpModule,
    FormDefinitionsModule,
    FormConfigModule,
    FormDraftsModule,
    PaymentsModule,
    FilesModule,
    ConfigModule.forFeature(sqsConfig),
    ConfigModule.forFeature(sesEventsConfig),
    ExpressionsModule,
  ],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    FormSubmissionRepository,
    NotificationLogRepository,
    SubmissionPipelineService,
    SesMailer,
    PaymentRequiredListener,
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
    SesEventConsumerService,
    SubmissionProcessorListener,
  ],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
