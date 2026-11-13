import { NotificationDeliveryStatus } from "@/database/entities/notification-log.entity";

/**
 * Minimal shape of an SES event-publishing notification (configuration-set
 * event destination → SNS → SQS). We only read the event type and the mail
 * message id; the rich per-type detail (bounce.bounceType, etc.) is ignored.
 *
 * Config-set event publishing uses `eventType`; the older identity-notification
 * format uses `notificationType`. We accept either so the parser is robust to
 * both wirings.
 */
interface SesEventLike {
  eventType?: string;
  notificationType?: string;
  mail?: {
    messageId?: string;
    timestamp?: string;
    /** SES echoes the send's EmailTags here, each as an array of values. */
    tags?: Record<string, unknown>;
  };
}

/** SNS "Notification" envelope — present only if raw message delivery is off. */
interface SnsEnvelope {
  Type?: string;
  Message?: string;
}

/** The reconcilable outcome of one SES event: which message, and its status. */
export interface ParsedSesEvent {
  messageId: string;
  status: NotificationDeliveryStatus;
  /** When SES accepted the original email (`mail.timestamp`). Undefined if the
   *  event carries no valid timestamp. */
  sentAt?: Date;
  /** The `submissionId` EmailTag, set on every send that writes a
   *  notification_log row (submission and payment-required emails). Its
   *  presence marks the email as tracked. */
  submissionId?: string;
}

/** The EmailTag name tracked sends carry. Shared with the senders so the two
 *  sides can't drift apart. */
export const SUBMISSION_ID_TAG = "submissionId";

const EVENT_STATUS: Record<string, NotificationDeliveryStatus> = {
  delivery: NotificationDeliveryStatus.DELIVERED,
  bounce: NotificationDeliveryStatus.BOUNCED,
  complaint: NotificationDeliveryStatus.COMPLAINED,
  reject: NotificationDeliveryStatus.REJECTED,
};

/**
 * Parse an SES delivery-events SQS message body into the message id + delivery
 * status to reconcile, or `null` when the body is unparseable or carries an
 * event type we don't track (Send / Open / Click / DeliveryDelay / …). A null
 * result means "nothing to do" — the caller safely deletes the message.
 *
 * Handles both raw-delivery bodies (the bare SES event) and, defensively, an
 * SNS "Notification" envelope whose `Message` holds the stringified event.
 */
export function parseSesEvent(body: string): ParsedSesEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  // Unwrap an SNS envelope if raw message delivery was not applied.
  const envelope = parsed as SnsEnvelope;
  if (
    envelope?.Type === "Notification" &&
    typeof envelope.Message === "string"
  ) {
    try {
      parsed = JSON.parse(envelope.Message);
    } catch {
      return null;
    }
  }

  const event = parsed as SesEventLike;
  const type = (event?.eventType ?? event?.notificationType)?.toLowerCase();
  const messageId = event?.mail?.messageId;
  if (!type || typeof messageId !== "string" || messageId.length === 0) {
    return null;
  }

  const status = EVENT_STATUS[type];
  if (!status) return null;

  const result: ParsedSesEvent = { messageId, status };

  const sentAt =
    typeof event.mail?.timestamp === "string"
      ? new Date(event.mail.timestamp)
      : undefined;
  if (sentAt && !Number.isNaN(sentAt.getTime())) result.sentAt = sentAt;

  const tag = event.mail?.tags?.[SUBMISSION_ID_TAG];
  const submissionId = Array.isArray(tag) ? tag[0] : tag;
  if (typeof submissionId === "string" && submissionId.length > 0) {
    result.submissionId = submissionId;
  }

  return result;
}
