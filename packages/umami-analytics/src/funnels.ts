// Form funnel definitions shared by the analytics dashboard and the Slack
// /stats command (#3491), so both report identical starts and completions.
import { eventName } from "@govtech-bb/analytics";
import type { FunnelStepInput, FunnelStepResult } from "./types";

/** Max minutes Umami allows between funnel steps. A form start→submit can span
 * a long single session, so keep this generous. */
export const FUNNEL_WINDOW_MIN = 60 * 24;

export function buildFunnelSteps(formId: string): FunnelStepInput[] {
  return [
    { type: "event", value: eventName(formId, "form-start") },
    { type: "event", value: eventName(formId, "form-review") },
    { type: "event", value: eventName(formId, "form-submit") },
  ];
}

/**
 * Funnel whose first step is the form page, used only for its step-0 visitor
 * count (the "visits" denominator). The trailing `*` captures the page with or
 * without a trailing slash (Umami records both as distinct paths) as one distinct
 * count — it assumes no form id is a prefix of another (true for current slugs).
 * Umami rejects a single-step funnel, so `form-start` is the required second
 * step; its own count isn't read here (starts come from the 3-step funnel that
 * also feeds the summary list, so the two pages stay consistent).
 */
export function buildVisitFunnelSteps(formId: string): FunnelStepInput[] {
  return [
    { type: "path", value: `/forms/${formId}*` },
    { type: "event", value: eventName(formId, "form-start") },
  ];
}

/** Distinct-visitor starts + completions from a form's funnel report rows. */
export function funnelHeadline(rows: FunnelStepResult[]): {
  starts: number;
  completed: number;
} {
  return {
    starts: rows[0]?.visitors ?? 0,
    completed: rows[rows.length - 1]?.visitors ?? 0,
  };
}
