import { z } from "zod";

/**
 * One MDA's CMS webhook destination. `url` is the endpoint; `secret` is the
 * `X-API-Key` value (managed in Secrets Manager, injected via env — never git).
 */
export interface WebhookDestination {
  url: string;
  secret: string;
}

export interface ParsedWebhookDestinations {
  /** ministry key → destination, for entries that validated. */
  destinations: Record<string, WebhookDestination>;
  /**
   * Human-readable problems found while parsing — surfaced on `/health` at
   * boot so a provisioning gap shows at deploy, not first submission. Never
   * contains secret values (only ministry keys / structural messages).
   */
  issues: string[];
}

const destinationSchema = z.object({
  url: z.string().min(1),
  secret: z.string().min(1),
});

/**
 * Parses and validates the `MDA_WEBHOOK_DESTINATIONS` JSON secret
 * (#1920/#2020) into a `{ ministryKey → { url, secret } }` map.
 *
 * Lenient by design (decision doc §3.2): a malformed blob or a bad entry is
 * collected as an `issue` (surfaced on /health) rather than thrown — one bad
 * ministry must not down the whole API at boot, and a missing/blank value must
 * not block boot. Valid entries alongside an invalid one are still returned;
 * dispatch fails loud (→ DLQ) for any ministry with no valid destination.
 */
export function parseWebhookDestinations(
  raw: string | undefined | null,
): ParsedWebhookDestinations {
  const issues: string[] = [];
  const destinations: Record<string, WebhookDestination> = {};

  if (!raw || raw.trim() === "") {
    // Unset/blank — no destinations. Not an issue in itself (a deploy may not
    // sync any CMS form); dispatch fail-loud handles a form that needs one.
    return { destinations, issues };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    issues.push("MDA_WEBHOOK_DESTINATIONS is not valid JSON");
    return { destinations, issues };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    issues.push(
      "MDA_WEBHOOK_DESTINATIONS must be a JSON object keyed by ministry",
    );
    return { destinations, issues };
  }

  for (const [ministry, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const result = destinationSchema.safeParse(value);
    if (!result.success) {
      issues.push(
        `MDA_WEBHOOK_DESTINATIONS["${ministry}"] is invalid: expected non-empty "url" and "secret"`,
      );
      continue;
    }
    destinations[ministry] = result.data;
  }

  return { destinations, issues };
}
