import { Injectable, Logger } from "@nestjs/common";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";
import { sign } from "./webhook-signature";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNATURE_HEADER = "X-Webhook-Signature";

@Injectable()
export class WebhookProcessor implements ISubmissionProcessor {
  readonly type = "webhook" as const;
  private readonly logger = new Logger(WebhookProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    const cfg = (payload.processors.find((p) => p.type === "webhook")?.config ??
      {}) as Record<string, unknown>;

    const url = cfg["url"] as string | undefined;
    if (!url) {
      this.logger.warn(
        `[webhook] No url configured for submission ${payload.submissionId} — skipping`,
      );
      return { kind: "completed" };
    }

    const method = (cfg["method"] as string | undefined) ?? "POST";
    const timeoutMs =
      (cfg["timeoutMs"] as number | undefined) ?? DEFAULT_TIMEOUT_MS;
    const signatureHeader =
      (cfg["signatureHeader"] as string | undefined) ??
      DEFAULT_SIGNATURE_HEADER;
    const secret = cfg["secret"] as string | undefined;
    const customHeaders = (cfg["headers"] as Record<string, string>) ?? {};

    // Serialize once: the signature is computed over the exact string sent.
    const body = JSON.stringify({
      event: "submission.created",
      version: "1",
      timestamp: new Date().toISOString(),
      data: {
        submissionId: payload.submissionId,
        formId: payload.formId,
        formVersion: payload.formVersion,
        values: payload.values,
        meta: payload.meta,
        submittedAt: payload.meta.submittedAt,
      },
    });

    // Reserved headers are applied last so author-supplied custom headers
    // cannot override Content-Type, the signature, or the idempotency key.
    const headers: Record<string, string> = {
      ...customHeaders,
      "Content-Type": "application/json",
      "X-Idempotency-Key": payload.submissionId,
    };
    if (secret) {
      headers[signatureHeader] = sign(body, secret);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `[webhook] Endpoint ${url} responded with HTTP ${response.status}`,
      );
    }

    this.logger.log(
      `[webhook] Delivered submission ${payload.submissionId} to ${url}`,
    );

    return { kind: "completed" };
  }
}
