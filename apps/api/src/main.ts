import "./tracing"; // must be first — initialises the OTEL SDK before any NestJS code
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { TracingInterceptor } from "./common/tracing.interceptor";
import { MetricsService } from "./telemetry/metrics.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const metricsService = app.get(MetricsService);
  const port = config.get<number>("app.port") ?? 3001;
  app.useGlobalFilters(new GlobalExceptionFilter(metricsService));
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new TracingInterceptor(),
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(port);
}

bootstrap();
