import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./entity-base";

export enum PaymentStatus {
  PENDING = "pending",
  INITIATED = "initiated",
  SUCCESS = "success",
  FAILED = "failed",
  CANCELLED = "cancelled",
  MISMATCHED = "mismatched",
  REFUNDED = "refunded",
}

export enum PaymentProvider {
  EZPAY = "ezpay",
}

@Entity({ name: "payments" })
@Index(["referenceNumber"], { unique: true })
@Index(["submissionId"], { unique: true })
export class PaymentEntity extends TimestampedEntity {
  @Column({ name: "reference_number", type: "uuid" })
  referenceNumber!: string;

  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @Column({
    name: "provider",
    type: "enum",
    enum: PaymentProvider,
    enumName: "payments_provider_enum",
  })
  provider!: PaymentProvider;

  @Column({ name: "department", type: "varchar", length: 100 })
  department!: string;

  @Column({ name: "payment_code", type: "varchar", length: 100 })
  paymentCode!: string;

  @Column({ name: "expected_amount", type: "decimal", precision: 10, scale: 2 })
  expectedAmount!: string;

  @Column({ name: "description", type: "varchar", length: 500 })
  description!: string;

  @Column({
    name: "provider_token",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  providerToken!: string | null;

  @Column({ name: "provider_url", type: "text", nullable: true })
  providerUrl!: string | null;

  @Column({
    name: "status",
    type: "enum",
    enum: PaymentStatus,
    enumName: "payments_status_enum",
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;
}
