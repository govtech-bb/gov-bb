import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AppController } from "./app.controller";
import { DatabaseModule } from "./database/database.module";
import { RegistryModule } from "./registry/registry.module";
import { FormsModule } from "./forms/forms.module";
import { PaymentsModule } from "./payments/payments.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { configs } from "./config";
import { envValidationSchema } from "./config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configs,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    EventEmitterModule.forRoot(),
    TelemetryModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RegistryModule,
    FormsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
