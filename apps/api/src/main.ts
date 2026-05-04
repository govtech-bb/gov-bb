import "./tracing"; // must be first — initialises the OTEL SDK before any NestJS code
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { TracingInterceptor } from "./common/tracing.interceptor";
import { MetricsService } from "./telemetry/metrics.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const metricsService = app.get(MetricsService);
  const port = config.get<number>("app.port") ?? 3001;
  const corsOrigin =
    config.get<string>("app.corsOrigin") ?? "http://localhost:3000";

  app.enableCors({
    origin: corsOrigin,
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
