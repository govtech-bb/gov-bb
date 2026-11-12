import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { z } from "zod";

// The tracker answers from DynamoDB; a stalled one must fail fast, well inside
// the chat's own 15-second budget.
const TRACKER_TIMEOUT_MS = 5_000;

// API Gateway's default endpoint names its region:
// https://<api-id>.execute-api.<region>.amazonaws.com
const EXECUTE_API_HOST =
  /^[a-z0-9]+\.execute-api\.([a-z0-9-]+)\.amazonaws\.com$/;

// The local lookup server (cms-application-tracker `pnpm local:api`) has no
// authoriser and a laptop has no task role, so requests to it go unsigned.
// Decided from the URL, so a real endpoint can never go out unsigned.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The tracker's `GET /status/{reference}` answer (apps/lookup). Only the status
// and when it changed are kept: `mda` and the echoed reference are dropped.
const lookupResultSchema = z.union([
  z.object({
    found: z.literal(true),
    status: z.string().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
  }),
  z.object({ found: z.literal(false) }),
]);

export type TrackerLookupResult =
  | { found: true; status: string; occurredAt: string }
  | { found: false };

/** Why a lookup failed. Safe to log: it never carries the reference. */
export class TrackerLookupError extends Error {
  constructor(readonly reason: string) {
    super(`Tracker lookup failed: ${reason}`);
    this.name = "TrackerLookupError";
  }
}

/**
 * Reads one application's status from the application tracker's lookup API
 * (#3419). The API is AWS_IAM-authorised, so each request is SigV4-signed with
 * the API task role's credentials (alpha-infra#763 grants it `GET /status/*`).
 */
@Injectable()
export class TrackerLookupClient {
  private readonly base: string;
  // Resolves the task role's credentials on first use and refreshes them
  // before they expire.
  private readonly credentials = defaultProvider();

  constructor(config: ConfigService) {
    this.base = config.get<string>("TRACKER_LOOKUP_API_URL", "");
  }

  async lookup(reference: string): Promise<TrackerLookupResult> {
    if (!this.base) throw new TrackerLookupError("not_configured");

    const url = new URL(
      `${this.base.replace(/\/$/, "")}/status/${encodeURIComponent(reference)}`,
    );
    const headers = await this.headersFor(url);

    let response: Response;
    try {
      response = await fetch(url.href, {
        headers,
        signal: AbortSignal.timeout(TRACKER_TIMEOUT_MS),
      });
    } catch (err) {
      throw new TrackerLookupError(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "timeout"
          : "network",
      );
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new TrackerLookupError(`http_${response.status}`);
    }

    const parsed = lookupResultSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) throw new TrackerLookupError("unreadable");
    return parsed.data.found
      ? {
          found: true,
          status: parsed.data.status,
          occurredAt: parsed.data.occurredAt,
        }
      : { found: false };
  }

  private async headersFor(url: URL): Promise<Record<string, string>> {
    if (LOCAL_HOSTS.has(url.hostname)) return {};

    const region = EXECUTE_API_HOST.exec(url.hostname)?.[1];
    if (!region) throw new TrackerLookupError("unknown_region");

    const signer = new SignatureV4({
      service: "execute-api",
      region,
      credentials: this.credentials,
      sha256: Sha256,
    });
    const signed = await signer.sign({
      method: "GET",
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      query: {},
      headers: { host: url.host },
    });
    return signed.headers;
  }
}
