import { Injectable } from "@nestjs/common";
import { AppError } from "@/common/errors";
import { writeBusinessLog } from "@/common/business-log";
import {
  journeyRequestSchema,
  type JourneyEvent,
} from "./journey-event.schema";

// Crawlers and headless browsers execute page scripts too; counting them would
// inflate visits and journeys. Matched on the User-Agent, which is NOT logged.
const BOT_USER_AGENT = /bot|crawl|spider|slurp|headless|lighthouse/i;

@Injectable()
export class JourneyService {
  /**
   * Validate and record a request's events. Returns how many were recorded
   * (0 for a bot). Throws 400 on a malformed body, so a broken client shows up
   * as errors rather than as quietly missing data.
   */
  record(body: unknown, userAgent: string | undefined): number {
    const events = this.parse(body);
    if (userAgent && BOT_USER_AGENT.test(userAgent)) return 0;

    for (const e of events) {
      writeBusinessLog("journey_event", {
        message: `journey ${e.event}`,
        app: e.app,
        event: e.event,
        event_id: e.id,
        page_load_id: e.page_load_id,
        path: e.path,
        props: e.props && sanitizeProps(e.props),
        client_ts: e.client_ts,
      });
    }
    return events.length;
  }

  private parse(body: unknown): JourneyEvent[] {
    // navigator.sendBeacon posts a string as text/plain (a CORS-simple request
    // that survives the page closing), so accept the JSON as text too.
    let raw = body;
    if (typeof body === "string") {
      try {
        raw = JSON.parse(body);
      } catch {
        throw AppError.badRequest("Body is not valid JSON");
      }
    }
    const result = journeyRequestSchema.safeParse(raw);
    if (!result.success) {
      throw AppError.badRequest("Invalid journey event");
    }
    return Array.isArray(result.data) ? result.data : [result.data];
  }
}

// A run of digit groups joined only by spaces or dashes (`246-123-4567`,
// `850101-0001`). Linear: each continuation needs a separator before more
// digits, so groups never overlap and there is no ReDoS surface.
const DIGIT_RUN = /\d+(?:[\s-]\d+)*/g;
// 6+ digits in one run reads as an identifier (NIS, phone, national ID, TAMIS);
// shorter numbers (years, "under 11") are kept. Same threshold as the sites'
// own masking in @govtech-bb/analytics.
const MIN_IDENTIFIER_DIGITS = 6;

function looksPersonal(value: string): boolean {
  if (value.includes("@")) return true;
  for (const run of value.match(DIGIT_RUN) ?? []) {
    if (run.replace(/\D/g, "").length >= MIN_IDENTIFIER_DIGITS) return true;
  }
  return false;
}

/**
 * Backstop: the sites already mask search text before sending, but the server
 * never trusts the client with personal data. Any string that looks like an
 * email or an identifier is blanked entirely (stricter than the sites' partial
 * mask, and independent of the browser package).
 */
export function sanitizeProps(
  props: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] =
      typeof value === "string" && looksPersonal(value) ? "[redacted]" : value;
  }
  return out;
}
