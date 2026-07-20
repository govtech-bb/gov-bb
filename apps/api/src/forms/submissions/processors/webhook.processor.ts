import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import type { WebhookMapping } from "@govtech-bb/form-types";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "./submission-processor.interface";
import type { SubmissionCreatedEvent } from "../submissions.types";
import { sign } from "./webhook-signature";
import { assertSafeUrl } from "./url-safety";
import { sanitizeForLog } from "./log-sanitize";
import { buildMappedCasePayload } from "./webhook-mapping";
import { idempotencyKey, timedPost } from "./http-post";
import { WebhookConfigError, WebhookDeliveryError } from "./webhook-errors";

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

  constructor(private readonly http: HttpService) {}

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. Defaults to 0 for direct single-entry invocation.
    const index = payload.processorIndex ?? 0;
    const cfg = (payload.processors[index]?.config ?? {}) as Record<
      string,
      unknown
    >;

    // Misconfiguration (missing endpoint/secret env, no url) throws
    // WebhookConfigError → the entry is routed to SQS retry/DLQ so the problem
    // is visible, rather than a form silently never syncing.
    const { url, fromRecipe } = this.resolveUrl(cfg, payload.submissionId);

    // SSRF guard (#287): only a recipe-supplied literal url is attacker-
    // controllable, so before dispatch we require https and refuse a host that
    // resolves to an internal address (private/loopback/link-local — notably the
    // cloud-metadata endpoint 169.254.169.254). Throws on violation: the entry
    // fails loudly rather than letting a malicious recipe drive an internal
    // request. An env-sourced endpoint is operator deploy config (may
    // legitimately be internal), so it is exempt.
    if (fromRecipe) await assertSafeUrl(url);

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
            submissionId: payload.submissionId,
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
      "X-Idempotency-Key": idempotencyKey(payload.submissionId, index),
    };
    this.applyAuth(cfg, headers, body, payload.submissionId);

    if (mapping) {
      // Mapped payloads carry applicant PII (name/email/phone in the body), so
      // we log only non-PII routing metadata — never the body. sanitizeForLog
      // strips control chars (log injection, CWE-117) from the env-sourced URL
      // and the reference code.
      this.logger.log(
        `[webhook] POST ${sanitizeForLog(url)} code=${sanitizeForLog(
          payload.referenceCode,
        )} programme=${mapping.programmeCode} bytes=${body.length}`,
      );
    }

    try {
      await timedPost(this.http, url, body, { headers, timeoutMs, method });
    } catch (err) {
      // A non-2xx / timeout / network error is transient — type it so the DLQ
      // alarm can tell "destination down" from "misconfigured". Message is
      // preserved (e.g. "HTTP 502").
      throw new WebhookDeliveryError(
        err instanceof Error ? err.message : String(err),
        { cause: err },
      );
    }

    this.logger.log(
      `[webhook] Delivered submission ${payload.submissionId} to ${url}`,
    );
    return { kind: "completed" };
  }

  /** Literal `url` (recipe-supplied), or `endpoint.env` (base) + optional
   * `path` (operator deploy config). `fromRecipe` tells the caller whether the
   * url is attacker-controllable and so must pass the SSRF guard. Throws
   * WebhookConfigError when a named endpoint env var is unset/empty, or when the
   * recipe declares neither `endpoint` nor `url` (misconfigured). */
  private resolveUrl(
    cfg: Record<string, unknown>,
    submissionId: string,
  ): { url: string; fromRecipe: boolean } {
    const endpoint = cfg["endpoint"] as WebhookEndpoint | undefined;
    if (endpoint) {
      const base = process.env[endpoint.env];
      if (!base) {
        throw new WebhookConfigError(
          `[webhook] ${endpoint.env} not set — cannot dispatch submission ${sanitizeForLog(submissionId)}`,
        );
      }
      const path = (endpoint.path ?? "").replace(/^\/+/, "");
      const url = path
        ? new URL(path, base.endsWith("/") ? base : `${base}/`).toString()
        : base;
      return { url, fromRecipe: false };
    }
    const url = cfg["url"] as string | undefined;
    if (!url) {
      throw new WebhookConfigError(
        `[webhook] no url or endpoint configured — cannot dispatch submission ${sanitizeForLog(submissionId)}`,
      );
    }
    return { url, fromRecipe: true };
  }

  /** Applies the configured auth to `headers`. Throws WebhookConfigError when an
   * env-sourced key isn't set/empty. */
  private applyAuth(
    cfg: Record<string, unknown>,
    headers: Record<string, string>,
    body: string,
    submissionId: string,
  ): void {
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
          throw new WebhookConfigError(
            `[webhook] ${auth.secretEnv} not set — cannot dispatch submission ${sanitizeForLog(submissionId)}`,
          );
        }
        headers[auth.header] = key;
      }
      return;
    }
    // Legacy inline HMAC secret.
    const secret = cfg["secret"] as string | undefined;
    if (secret) {
      const signatureHeader =
        (cfg["signatureHeader"] as string | undefined) ??
        DEFAULT_SIGNATURE_HEADER;
      headers[signatureHeader] = sign(body, secret);
    }
  }
}
