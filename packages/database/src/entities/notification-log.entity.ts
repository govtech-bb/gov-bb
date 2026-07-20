import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./entity-base";

/**
 * Outcome of a single attempt to send a submission-notification email,
 * recorded by the API at send time. Purpose: make undelivered MDA
 * notifications visible and recoverable (the summer-camp incident — a form
 * went live before its MDA recipient was configured, so the citizen was
 * notified but the ministry was not, silently). Until this log existed the
 * only record was a CloudWatch log line.
 */
export enum NotificationOutcome {
  /** SES accepted the send (delivery truth is reconciled later via SES events). */
  SENT = "sent",
  /** Transient/SES/resolver error — the send threw and (in prod) retries → DLQ. */
  FAILED = "failed",
  /** config.* recipient had no MDA row, so it fell back to the default test
   *  inbox. Non-prod only — in prod a missing MDA recipient is a FAILED send
   *  (see EmailProcessor.resolveConfigRecipient / MDA_REQUIRE_RECIPIENT). */
  DEFAULTED = "defaulted",
  /** The configured recipientField resolved to nothing (non-retryable). */
  NO_RECIPIENT = "no_recipient",
}

/**
 * SES-reported delivery truth, reconciled from the SES configuration-set event
 * destination (delivery / bounce / complaint / reject). Null until a future SES
 * event consumer fills it — the API only knows SES *accepted* the send.
 */
export enum NotificationDeliveryStatus {
  DELIVERED = "delivered",
  BOUNCED = "bounced",
  COMPLAINED = "complained",
  REJECTED = "rejected",
}

@Entity({ name: "notification_log" })
export class NotificationLogEntity extends TimestampedEntity {
  /** form_submissions.id (uuid) of the submission this notification is for. */
  @Index("ix_notification_log_submission_id")
  @Column({ name: "submission_id", type: "varchar", length: 64 })
  submissionId!: string;

  @Index("ix_notification_log_form_id")
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  /** Human-readable submission reference (e.g. "JPP-20260604-130732-9JZRZC"). */
  @Column({
    name: "reference_code",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  referenceCode!: string | null;

  /** Recipient classification — literal | contact | config | submitted. The
   *  config/contact kinds are the MDA/reviewer notification; submitted is the
   *  citizen acknowledgement. (classifyRecipientField, @govtech-bb/form-types.) */
  @Column({ name: "recipient_kind", type: "varchar", length: 20 })
  recipientKind!: string;

  /** Resolved recipient address. Null when no recipient could be resolved. */
  @Column({ type: "varchar", length: 320, nullable: true })
  recipient!: string | null;

  @Index("ix_notification_log_outcome")
  @Column({
    type: "enum",
    enum: NotificationOutcome,
    enumName: "notification_outcome_enum",
  })
  outcome!: NotificationOutcome;

  /** Failure reason for outcome = failed / no_recipient. */
  @Column({ type: "text", nullable: true })
  error!: string | null;

  /** SES MessageId of the accepted send — the join key a future SES-event
   *  consumer uses to reconcile delivery_status onto this row. */
  @Column({
    name: "provider_message_id",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  providerMessageId!: string | null;

  /** SES delivery truth; null until reconciled by the SES-event consumer. */
  @Column({
    name: "delivery_status",
    type: "enum",
    enum: NotificationDeliveryStatus,
    enumName: "notification_delivery_status_enum",
    nullable: true,
  })
  deliveryStatus!: NotificationDeliveryStatus | null;
}
