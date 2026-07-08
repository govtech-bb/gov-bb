import { DataSource, DataSourceOptions } from "typeorm";

// Entities
import { FormComponentEntity } from "./entities/form-component.entity";
import { FormDefinitionEntity } from "./entities/form-definition.entity";
import { FormDraftEntity } from "./entities/form-draft.entity";
import { FormSubmissionEntity } from "./entities/form-submission.entity";
import { PaymentEntity } from "./entities/payment.entity";
import { PaymentTransactionEntity } from "./entities/payment-transaction.entity";
import { CustomComponent } from "./entities/custom-component.entity";
import { MdaContactEntity } from "./entities/mda-contact.entity";
import { FormConfigEntity } from "./entities/form-config.entity";
import { FormDisabledOverrideEntity } from "./entities/form-disabled-override.entity";
import { FormEditingSessionEntity } from "./entities/form-editing-session.entity";
import { ServiceStatusEntity } from "./entities/service-status.entity";
import { ServiceStatusAuditLogEntity } from "./entities/service-status-audit-log.entity";
import { NotificationLogEntity } from "./entities/notification-log.entity";

// Migrations
import { CreateFormsTables1774544962999 } from "./migrations/1774544962999-CreateFormsTables";
import { CreateCustomComponents1775061357620 } from "./migrations/1775061357620-CreateCustomComponents";
import { CreateFormDrafts1775500000000 } from "./migrations/1775500000000-CreateFormDrafts";
import { AddIdempotencyKeyToFormSubmissions1776119150309 } from "./migrations/1776119150309-AddIdempotencyKeyToFormSubmissions";
import { AddPendingPaymentSubmissionStatus1777896617226 } from "./migrations/1777896617226-AddPendingPaymentSubmissionStatus";
import { CreatePaymentTables1777896888080 } from "./migrations/1777896888080-CreatePaymentTables";
import { AddAbandonedPaymentIndex1778195854282 } from "./migrations/1778195854282-AddAbandonedPaymentIndex";
import { AddFormDefinitionUniqueConstraint1778500000000 } from "./migrations/1778500000000-AddFormDefinitionUniqueConstraint";
import { AddReferenceCodeToFormSubmissions1778841559000 } from "./migrations/1778841559000-AddReferenceCodeToFormSubmissions";
import { CreateFormDisabledOverrides1779466523478 } from "./migrations/1779466523478-CreateFormDisabledOverrides";
import { CreateMdaContactAndFormConfig1780520220084 } from "./migrations/1780520220084-CreateMdaContactAndFormConfig";
import { CreateFormEditingSessions1780924594196 } from "./migrations/1780924594196-CreateFormEditingSessions";
import { MakeFormVersionNullable1781000000000 } from "./migrations/1781000000000-MakeFormVersionNullable";
import { DedupFormDefinitionsUniqueFormId1781100000000 } from "./migrations/1781100000000-DedupFormDefinitionsUniqueFormId";
import { AddProcessorsFailedToFormSubmissions1781200000000 } from "./migrations/1781200000000-AddProcessorsFailedToFormSubmissions";
import { CreateServiceStatusTables1783356461699 } from "./migrations/1783356461699-CreateServiceStatusTables";
import { RenameServiceStatusFormIdToSlug1783440984875 } from "./migrations/1783440984875-RenameServiceStatusFormIdToSlug";
import { CreateNotificationLog1783458705143 } from "./migrations/1783458705143-CreateNotificationLog";
import { SeedServiceStatus1783520007424 } from "./migrations/1783520007424-SeedServiceStatus";

export const entities = [
  FormComponentEntity,
  FormDefinitionEntity,
  FormDraftEntity,
  FormSubmissionEntity,
  PaymentEntity,
  PaymentTransactionEntity,
  CustomComponent,
  MdaContactEntity,
  FormConfigEntity,
  FormDisabledOverrideEntity,
  FormEditingSessionEntity,
  ServiceStatusEntity,
  ServiceStatusAuditLogEntity,
  NotificationLogEntity,
];

export const migrations = [
  CreateFormsTables1774544962999,
  CreateCustomComponents1775061357620,
  CreateFormDrafts1775500000000,
  AddIdempotencyKeyToFormSubmissions1776119150309,
  AddPendingPaymentSubmissionStatus1777896617226,
  CreatePaymentTables1777896888080,
  AddAbandonedPaymentIndex1778195854282,
  AddFormDefinitionUniqueConstraint1778500000000,
  AddReferenceCodeToFormSubmissions1778841559000,
  CreateFormDisabledOverrides1779466523478,
  CreateMdaContactAndFormConfig1780520220084,
  CreateFormEditingSessions1780924594196,
  MakeFormVersionNullable1781000000000,
  DedupFormDefinitionsUniqueFormId1781100000000,
  AddProcessorsFailedToFormSubmissions1781200000000,
  CreateServiceStatusTables1783356461699,
  RenameServiceStatusFormIdToSlug1783440984875,
  CreateNotificationLog1783458705143,
  SeedServiceStatus1783520007424,
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

// Shared env→DataSource helpers
export {
  buildSslConfig,
  dbOptionsFromEnv,
  createDataSourceFromEnv,
} from "./data-source-env";

// Re-export all entities and migration classes
export * from "./entities/index";
export * from "./migrations/index";
