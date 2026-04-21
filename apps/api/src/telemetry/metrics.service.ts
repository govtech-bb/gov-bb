import { Injectable, OnModuleInit } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

@Injectable()
export class MetricsService implements OnModuleInit {
  private submissionsCounter!: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  private duplicateSubmissionsCounter!: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  private validationFailuresCounter!: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  private httpErrorsCounter!: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;

  onModuleInit() {
    const meter = metrics.getMeter('modular-forms-api');

    this.submissionsCounter = meter.createCounter('form.submissions.total', {
      description: 'Total number of form submissions',
    });

    this.duplicateSubmissionsCounter = meter.createCounter('form.submissions.duplicates', {
      description: 'Number of duplicate or in-progress submission attempts',
    });

    this.validationFailuresCounter = meter.createCounter('form.validation.failures', {
      description: 'Number of request validation failures (400s from ValidationPipe)',
    });

    this.httpErrorsCounter = meter.createCounter('http.errors.total', {
      description: 'Total number of HTTP errors by status code',
    });
  }

  recordSubmission(formId: string, outcome: 'created' | 'duplicate' | 'in_progress') {
    if (outcome === 'created') {
      this.submissionsCounter.add(1, { 'form.id': formId, outcome });
    } else {
      this.duplicateSubmissionsCounter.add(1, { 'form.id': formId, outcome });
    }
  }

  recordValidationFailure(path: string) {
    this.validationFailuresCounter.add(1, { 'http.route': path });
  }

  recordHttpError(statusCode: number, method: string, path: string) {
    this.httpErrorsCounter.add(1, {
      'http.status_code': statusCode,
      'http.method': method,
      'http.route': path,
    });
  }
}
