import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AppController } from "./app.controller";
import { DatabaseModule } from "./database/database.module";
import { RegistryModule } from "./registry/registry.module";
import { FormsModule } from "./forms/forms.module";
import { FilesModule } from "./files/files.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { configs } from "./config";
import { envValidationSchema } from "./config/env.validation";

// Throttler buckets are per-process in-memory. When the API runs as multiple
// Fargate tasks, each task owns its own counters, so the effective per-IP
// ceiling is N× these limits. Acceptable as defense-in-depth alongside the
// AWS WAF rate-based rule (see docs/runbooks/aws-security.md). Switch to a
// shared store (Redis) if/when horizontal scaling makes that under-protection
// material.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configs,
      // Zod fail-fast validation (#1422). The schema bakes in `.passthrough()`
      // (== Joi's allowUnknown) and collects all issues (== abortEarly: false);
      // ConfigModule writes the parsed result back to process.env, so we return
      // the parsed object rather than just throwing.
      validate: (config) => envValidationSchema.parse(config),
    }),
    ThrottlerModule.forRoot([
      { name: "short", ttl: 10_000, limit: 5 },
      { name: "medium", ttl: 60_000, limit: 60 },
      { name: "long", ttl: 3_600_000, limit: 1_000 },
    ]),
    EventEmitterModule.forRoot(),
    TelemetryModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RegistryModule,
    FormsModule,
    FilesModule,
    PaymentsModule,
    WebhooksModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
