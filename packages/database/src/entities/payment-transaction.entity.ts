import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./entity-base";

export enum PaymentTransactionStatus {
  INITIATED = "initiated",
  SUCCESS = "success",
  FAILED = "failed",
}

@Entity({ name: "payment_transactions" })
@Index(["transactionNumber"], { unique: true })
@Index(["paymentId"])
@Index(["status"])
export class PaymentTransactionEntity extends TimestampedEntity {
  @Column({ name: "payment_id", type: "uuid" })
  paymentId!: string;

  @Column({ name: "transaction_number", type: "varchar", length: 100 })
  transactionNumber!: string;

  @Column({ name: "processor", type: "varchar", length: 50, nullable: true })
  processor!: string | null;

  @Column({
    name: "status",
    type: "enum",
    enum: PaymentTransactionStatus,
    enumName: "payment_transactions_status_enum",
  })
  status!: PaymentTransactionStatus;

  @Column({ name: "amount", type: "decimal", precision: 10, scale: 2 })
  amount!: string;

  @Column({ name: "date_settled", type: "timestamp", nullable: true })
  dateSettled!: Date | null;

  @Column({ name: "raw_response", type: "jsonb", nullable: true })
  rawResponse!: Record<string, unknown> | null;
}
