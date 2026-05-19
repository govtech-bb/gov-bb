import { DataSource, DataSourceOptions } from "typeorm";

// Entities
import { FormComponentEntity } from "./entities/form-component.entity";
import { FormDefinitionEntity } from "./entities/form-definition.entity";
import { FormDraftEntity } from "./entities/form-draft.entity";
import { FormSubmissionEntity } from "./entities/form-submission.entity";
import { PaymentEntity } from "./entities/payment.entity";
import { PaymentTransactionEntity } from "./entities/payment-transaction.entity";
import { CustomComponent } from "./entities/custom-component.entity";

// Migrations
import { CreateFormsTables1774544962999 } from "./migrations/1774544962999-CreateFormsTables";
import { CreateCustomComponents1775061357620 } from "./migrations/1775061357620-CreateCustomComponents";
import { CreateFormDrafts1775500000000 } from "./migrations/1775500000000-CreateFormDrafts";
import { AddIdempotencyKeyToFormSubmissions1776119150309 } from "./migrations/1776119150309-AddIdempotencyKeyToFormSubmissions";
import { AddPendingPaymentSubmissionStatus1777896617226 } from "./migrations/1777896617226-AddPendingPaymentSubmissionStatus";
import { CreatePaymentTables1777896888080 } from "./migrations/1777896888080-CreatePaymentTables";
import { AddAbandonedPaymentIndex1778195854282 } from "./migrations/1778195854282-AddAbandonedPaymentIndex";

export const entities = [
  FormComponentEntity,
  FormDefinitionEntity,
  FormDraftEntity,
  FormSubmissionEntity,
  PaymentEntity,
  PaymentTransactionEntity,
  CustomComponent,
];

export const migrations = [
  CreateFormsTables1774544962999,
  CreateCustomComponents1775061357620,
  CreateFormDrafts1775500000000,
  AddIdempotencyKeyToFormSubmissions1776119150309,
  AddPendingPaymentSubmissionStatus1777896617226,
  CreatePaymentTables1777896888080,
  AddAbandonedPaymentIndex1778195854282,
];

/**
 * Creates a new TypeORM DataSource with the package's entities and migrations
 * pre-configured. The caller provides connection and runtime options.
 */
export function createDataSource(
  config: Omit<DataSourceOptions, "entities" | "migrations">,
): DataSource {
  return new DataSource({
    ...config,
    entities,
    migrations,
  } as DataSourceOptions);
}

// Re-export all entities
export * from "./entities/index";
