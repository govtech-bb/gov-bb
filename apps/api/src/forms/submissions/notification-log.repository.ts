import { DataSource } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { BaseRepository } from "@/database/base.repository";
import {
  NotificationLogEntity,
  NotificationOutcome,
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
}
