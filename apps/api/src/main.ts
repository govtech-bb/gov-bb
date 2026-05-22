import "./tracing"; // must be first — initialises the OTEL SDK before any NestJS code
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DataSource } from "typeorm";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { TracingInterceptor } from "./common/tracing.interceptor";
import { MetricsService } from "./telemetry/metrics.service";
import { runSeed } from "./database/seed";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const metricsService = app.get(MetricsService);
  const port = config.get<number>("app.port") ?? 3001;

  app.use(require("express").json({ limit: "1mb" }));
  const corsOrigin =
    config.get<string>("app.corsOrigin") ?? "http://localhost:3000";
  const corsOrigins = corsOrigin.includes(",")
    ? corsOrigin.split(",").map((o) => o.trim())
    : corsOrigin;

  // contentSecurityPolicy is disabled because the only HTML this API serves is
  // Swagger UI at /api-docs, which needs inline scripts/styles. CSP for the
  // forms app lives in apps/forms (see Amplify customHeaders).
  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    credentials: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter(metricsService));
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new TracingInterceptor(),
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Run any pending migrations before accepting traffic. Idempotent —
  // TypeORM tracks applied migrations in its own table.
  const dataSource = app.get(DataSource);
  const logger = new Logger("Bootstrap");
  const pending = await dataSource.showMigrations();
  if (pending) {
    logger.log("Running pending database migrations…");
    await dataSource.runMigrations();
    logger.log("Migrations complete");
  }

  // Optional local-dev seed. Gated to keep production deploys clean.
  if (process.env.SEED_ON_BOOT === "true") {
    logger.log("SEED_ON_BOOT=true — applying seed data");
    await runSeed(dataSource);
    logger.log("Seed complete");
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Modular Forms API")
    .setDescription(
      "REST API for managing form definitions, drafts, and submissions.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your Bearer token",
      },
      "bearer",
    )
    .addTag("Health", "Liveness and readiness checks")
    .addTag("Form Definitions", "Retrieve published form schemas")
    .addTag("Form Drafts", "Save and resume in-progress form submissions")
    .addTag("Submissions", "Finalise drafts into permanent form submissions")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api-docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
    customSiteTitle: "Modular Forms API Docs",
  });

  await app.listen(port);
}

bootstrap();
