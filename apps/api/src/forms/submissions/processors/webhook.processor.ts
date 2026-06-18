import { Injectable, Logger } from "@nestjs/common";
import type { WebhookMapping } from "@govtech-bb/form-types";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";
import { sign } from "./webhook-signature";
import { sanitizeForLog } from "./log-sanitize";
import { buildMappedCasePayload } from "./webhook-mapping";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNATURE_HEADER = "X-Webhook-Signature";

interface WebhookEndpoint {
  env: string;
  path?: string;
}
type WebhookAuth =
  | { scheme: "hmac"; secret: string; signatureHeader?: string }
  | { scheme: "apiKey"; header: string; secretEnv: string }
  | { scheme: "none" };

/**
 * Generic outbound webhook. Two payload modes:
 *  - default "envelope": posts the raw submission ({event,version,data}).
 *  - "mapped" (when `config.mapping` is set): posts a flattened case payload
 *    ({code, programme_code, applicant, form_data, submitted_at}) built from the
 *    recipe's declarative field mapping — the generic replacement for the old
 *    case-management processor, with no form-specific logic baked into the API.
 *
 * Endpoint and secret can come from env (`config.endpoint` / `auth.secretEnv`)
 * so deploy-specific URLs and keys stay out of the git-committed recipe.
 */
@Injectable()
export class WebhookProcessor implements ISubmissionProcessor {
  readonly type = "webhook" as const;
  private readonly logger = new Logger(WebhookProcessor.name);

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. Defaults to 0 for direct single-entry invocation.
    const index = payload.processorIndex ?? 0;
    const cfg = (payload.processors[index]?.config ?? {}) as Record<
      string,
      unknown
    >;

    const url = this.resolveUrl(cfg, payload.submissionId);
    if (!url) return { kind: "completed" };

    const method = (cfg["method"] as string | undefined) ?? "POST";
    const timeoutMs =
      (cfg["timeoutMs"] as number | undefined) ?? DEFAULT_TIMEOUT_MS;
    const mapping = cfg["mapping"] as WebhookMapping | undefined;

    // Serialize once: the signature is computed over the exact string sent.
    const body = mapping
      ? JSON.stringify(
          buildMappedCasePayload({
            mapping,
            values: payload.values,
            referenceCode: payload.referenceCode,
            submittedAt: payload.meta.submittedAt,
          }),
        )
      : JSON.stringify({
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

    // Reserved headers are applied last so author-supplied custom headers cannot
    // override Content-Type, the auth header, or the idempotency key. The key
    // carries the index so each entry retries independently.
    const customHeaders = (cfg["headers"] as Record<string, string>) ?? {};
    const headers: Record<string, string> = {
      ...customHeaders,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${payload.submissionId}:${index}`,
    };
    if (!this.applyAuth(cfg, headers, body, payload.submissionId)) {
      return { kind: "completed" }; // auth configured to use env that isn't set
    }

    if (mapping) {
      // Mapped payloads carry applicant PII; sanitizeForLog strips control chars
      // (log injection, CWE-117) and bounds length. Keep out of long-retention sinks.
      this.logger.log(
        `[webhook] POST ${sanitizeForLog(url)} payload: ${sanitizeForLog(body)}`,
      );
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

  /** Literal `url`, or `endpoint.env` (base) + optional `path`. Returns null
   * (and skips) when an env-sourced endpoint isn't configured. */
  private resolveUrl(
    cfg: Record<string, unknown>,
    submissionId: string,
  ): string | null {
    const endpoint = cfg["endpoint"] as WebhookEndpoint | undefined;
    if (endpoint) {
      const base = process.env[endpoint.env];
      if (!base) {
        this.logger.warn(
          `[webhook] ${endpoint.env} not set — skipping submission ${submissionId}`,
        );
        return null;
      }
      const path = (endpoint.path ?? "").replace(/^\/+/, "");
      return path
        ? new URL(path, base.endsWith("/") ? base : `${base}/`).toString()
        : base;
    }
    const url = cfg["url"] as string | undefined;
    if (!url) {
      this.logger.warn(
        `[webhook] No url/endpoint configured — skipping submission ${submissionId}`,
      );
      return null;
    }
    return url;
  }

  /** Applies the configured auth to `headers`. Returns false when an env-sourced
   * key isn't set (caller skips). */
  private applyAuth(
    cfg: Record<string, unknown>,
    headers: Record<string, string>,
    body: string,
    submissionId: string,
  ): boolean {
    const auth = cfg["auth"] as WebhookAuth | undefined;
    if (auth) {
      if (auth.scheme === "hmac") {
        headers[auth.signatureHeader ?? DEFAULT_SIGNATURE_HEADER] = sign(
          body,
          auth.secret,
        );
      } else if (auth.scheme === "apiKey") {
        const key = process.env[auth.secretEnv];
        if (!key) {
          this.logger.warn(
            `[webhook] ${auth.secretEnv} not set — skipping submission ${submissionId}`,
          );
          return false;
        }
        headers[auth.header] = key;
      }
      return true;
    }
    // Legacy inline HMAC secret.
    const secret = cfg["secret"] as string | undefined;
    if (secret) {
      const signatureHeader =
        (cfg["signatureHeader"] as string | undefined) ??
        DEFAULT_SIGNATURE_HEADER;
      headers[signatureHeader] = sign(body, secret);
    }
    return true;
  }
}
