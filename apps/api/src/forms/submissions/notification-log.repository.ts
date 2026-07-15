import { DataSource } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { BaseRepository } from "@/database/base.repository";
import {
  NotificationLogEntity,
  NotificationOutcome,
  NotificationDeliveryStatus,
} from "@/database/entities/notification-log.entity";

/** The fields the caller supplies when recording a send attempt; the rest
 *  (id, timestamps, delivery_status) are DB-defaulted or filled later. */
export interface NotificationOutcomeInput {
  submissionId: string;
  formId: string;
  referenceCode?: string | null;
  /** literal | contact | config | submitted (classifyRecipientField). */
  recipientKind: string;
  recipient?: string | null;
  outcome: NotificationOutcome;
  error?: string | null;
  /** SES MessageId of an accepted send — the SES-event reconciliation key. */
  providerMessageId?: string | null;
}

@Injectable()
export class NotificationLogRepository extends BaseRepository<NotificationLogEntity> {
  private readonly logger = new Logger(NotificationLogRepository.name);

  constructor(dataSource: DataSource) {
    super(NotificationLogEntity, dataSource.createEntityManager());
  }

  /**
   * Record the outcome of one notification-send attempt. **Best-effort: never
   * throws.** The log is an observability aid, so a failure to write it must
   * not break an otherwise-successful send, nor mask the real error on a
   * failing one — it degrades to a warning.
   */
  async record(input: NotificationOutcomeInput): Promise<void> {
    try {
      await this.insert({
        submissionId: input.submissionId,
        formId: input.formId,
        referenceCode: input.referenceCode ?? null,
        recipientKind: input.recipientKind,
        recipient: input.recipient ?? null,
        outcome: input.outcome,
        error: input.error ?? null,
        providerMessageId: input.providerMessageId ?? null,
      });
    } catch (err) {
      this.logger.warn(
        `[notification-log] Failed to record outcome="${input.outcome}" for submission ${input.submissionId}`,
        err,
      );
    }
  }

  /**
   * Recent send outcomes, newest first — powers the monitoring console's
   * Delivery view. Read-only projection of the human-relevant columns (no
   * submission_id / error). `delivery_status` is included so the console can
   * show SES-reconciled delivery truth (null until the SesEventConsumer fills
   * it). `limit` is clamped to [1, 500].
   */
  async findRecent(limit = 200): Promise<NotificationLogEntity[]> {
    const take = Math.min(Math.max(Math.trunc(limit) || 200, 1), 500);
    return this.find({
      order: { createdAt: "DESC" },
      take,
      select: {
        referenceCode: true,
        formId: true,
        recipientKind: true,
        recipient: true,
        outcome: true,
        providerMessageId: true,
        deliveryStatus: true,
        createdAt: true,
      },
    });
  }

  /**
   * Reconcile SES delivery truth onto the row whose provider_message_id matches
   * the SES MessageId, from a delivery/bounce/complaint/reject event. Called by
   * the SesEventConsumer.
   *
   * Returns "unmatched" when no row carries this message id — which is normally
   * a **race** (the SES event outran the notification_log insert), so the
   * consumer leaves the SQS message to redeliver (and, after maxReceiveCount,
   * DLQ). Returns "matched" once a row exists, even if the guard below makes the
   * write a no-op, so a genuine event is never stuck retrying.
   *
   * Precedence guard: a terminal "bad" outcome (bounced/complained/rejected) is
   * never downgraded to "delivered" by a late/duplicate Delivery event — but a
   * Complaint that arrives *after* a Delivery still wins (complaints only ever
   * follow a delivery). Enforced in one atomic UPDATE, so concurrent events for
   * the same message can't race a read-modify-write.
   */
  async reconcileDeliveryStatus(
    messageId: string,
    status: NotificationDeliveryStatus,
  ): Promise<"matched" | "unmatched"> {
    const exists = await this.count({
      where: { providerMessageId: messageId },
    });
    if (exists === 0) return "unmatched";

    await this.createQueryBuilder()
      .update(NotificationLogEntity)
      .set({ deliveryStatus: status })
      .where("provider_message_id = :messageId", { messageId })
      // Apply unless we'd overwrite an existing status with "delivered"
      // (delivered never supersedes an already-recorded bad/terminal outcome).
      .andWhere("(delivery_status IS NULL OR :status <> :delivered)", {
        status,
        delivered: NotificationDeliveryStatus.DELIVERED,
      })
      .execute();

    return "matched";
  }
}
