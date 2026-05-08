import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { PaymentEntity } from "../database/entities/payment.entity";
import { PaymentTransactionEntity } from "../database/entities/payment-transaction.entity";
import { PaymentRepository } from "./payment.repository";
import { EzpayClient } from "../forms/submissions/processors/payment/ezpay/ezpay.client";
import {
  EZPAY_CONFIG,
  EzpayConfig,
} from "../forms/submissions/processors/payment/ezpay/ezpay.config";
import { DepartmentKeyResolver } from "../forms/submissions/processors/payment/ezpay/department-keys";
import { PaymentWebhookController } from "./payment-webhook.controller";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { AbandonedPaymentCleanupService } from "./abandoned-payment-cleanup.service";
import { FormDefinitionsModule } from "../forms/form-definitions/form-definitions.module";

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([PaymentEntity, PaymentTransactionEntity]),
    FormDefinitionsModule,
  ],
  controllers: [PaymentWebhookController],
  providers: [
    PaymentRepository,
    {
      provide: EZPAY_CONFIG,
      useFactory: (cfg: ConfigService): EzpayConfig => ({
        baseUrl: cfg.getOrThrow<string>("EZPAY_BASE_URL"),
      }),
      inject: [ConfigService],
    },
    EzpayClient,
    {
      provide: DepartmentKeyResolver,
      useFactory: (cfg: ConfigService) =>
        DepartmentKeyResolver.fromJson(
          cfg.getOrThrow<string>("EZPAY_DEPARTMENT_API_KEYS"),
        ),
      inject: [ConfigService],
    },
    PaymentWebhookService,
    PaymentReconciliationService,
    AbandonedPaymentCleanupService,
  ],
  exports: [PaymentRepository, EzpayClient, DepartmentKeyResolver],
})
export class PaymentsModule {}
