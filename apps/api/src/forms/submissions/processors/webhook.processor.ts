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
import { WebhookConfigError } from "./webhook-errors";
import { WebhookDestinationsService } from "@/forms/webhook-destinations/webhook-destinations.service";

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
 * A mapped (case-management) webhook carries **no** destination in the recipe:
 * its URL + `X-API-Key` secret resolve per-MDA from the `MDA_WEBHOOK_DESTINATIONS`
 * secret via the `form_config → mda_contact` ministry key (#1920/#2020), and a
 * miss fails loud (→ DLQ). A generic (envelope) webhook still takes its
 * endpoint/url + auth from the recipe/env.
 */
@Injectable()
export class WebhookProcessor implements ISubmissionProcessor {
  readonly type = "webhook" as const;
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly http: HttpService,
    private readonly destinations: WebhookDestinationsService,
  ) {}

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. Defaults to 0 for direct single-entry invocation.
    const index = payload.processorIndex ?? 0;
    const cfg = (payload.processors[index]?.config ?? {}) as Record<
      string,
      unknown
    >;

    const mapping = cfg["mapping"] as WebhookMapping | undefined;
    const method = (cfg["method"] as string | undefined) ?? "POST";
    const timeoutMs =
      (cfg["timeoutMs"] as number | undefined) ?? DEFAULT_TIMEOUT_MS;

    // Resolve the destination. A mapped (case-management) webhook resolves its
    // URL + secret per-MDA from MDA_WEBHOOK_DESTINATIONS (via form_config →
    // mda_contact ministry key) and fails loud (→ DLQ) on any miss. A generic
    // webhook takes its endpoint/url from the recipe/env.
    let url: string;
    let apiKeySecret: string | null = null;
    if (mapping) {
      const dest = await this.destinations.resolveWebhookDestination(
        payload.formId,
      );
      if (!dest) {
        throw new WebhookConfigError(
          `[webhook] no MDA destination for form "${sanitizeForLog(
            payload.formId,
          )}" — check its form_config ministry key and MDA_WEBHOOK_DESTINATIONS`,
        );
      }
      url = dest.url;
      apiKeySecret = dest.secret;
      // Ops-provided endpoint: SSRF guard (#287) before dispatch — require https
      // and refuse a host resolving to an internal address.
      await assertSafeUrl(url);
    } else {
      const resolved = this.resolveUrl(cfg, payload.submissionId);
      if (!resolved) return { kind: "completed" };
      url = resolved.url;
      // Only a recipe-supplied literal url is attacker-controllable; an
      // env-sourced endpoint is operator deploy config, so it is exempt.
      if (resolved.fromRecipe) await assertSafeUrl(url);
    }

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
      "X-Idempotency-Key": idempotencyKey(payload.submissionId, index),
    };
    if (mapping) {
      // Per-MDA API key from the resolved destination (sent as X-API-Key).
      headers["X-API-Key"] = apiKeySecret as string;
    } else if (!this.applyAuth(cfg, headers, body, payload.submissionId)) {
      return { kind: "completed" }; // auth configured to use env that isn't set
    }

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

    await timedPost(this.http, url, body, { headers, timeoutMs, method });

    this.logger.log(
      `[webhook] Delivered submission ${payload.submissionId} to ${url}`,
    );
    return { kind: "completed" };
  }

  /** Literal `url` (recipe-supplied), or `endpoint.env` (base) + optional
   * `path` (operator deploy config). `fromRecipe` tells the caller whether the
   * url is attacker-controllable and so must pass the SSRF guard. Returns null
   * (and skips) when an env-sourced endpoint isn't configured. */
  private resolveUrl(
    cfg: Record<string, unknown>,
    submissionId: string,
  ): { url: string; fromRecipe: boolean } | null {
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
      const url = path
        ? new URL(path, base.endsWith("/") ? base : `${base}/`).toString()
        : base;
      return { url, fromRecipe: false };
    }
    const url = cfg["url"] as string | undefined;
    if (!url) {
      this.logger.warn(
        `[webhook] No url/endpoint configured — skipping submission ${submissionId}`,
      );
      return null;
    }
    return { url, fromRecipe: true };
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
