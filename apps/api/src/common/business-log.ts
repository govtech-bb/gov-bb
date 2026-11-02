// One-line JSON log records for business analytics.
//
// Nest's Logger prints coloured plain text, which a log platform has to
// re-parse with fragile patterns. These records are written as a single JSON
// object per line on stdout, so CloudWatch keeps them verbatim and Datadog
// (or a CloudWatch Logs Insights query) reads the fields directly.
//
// `log_type` names the record family so dashboards can select them exactly.
// Field names avoid Datadog's reserved attributes (`status`, `service`, `host`,
// `date`), which would otherwise be reinterpreted.

export type BusinessLogType =
  | "journey_event"
  | "journey_rejected"
  | "business_event"
  // Upload malware-scan outcomes (#2938). Infra's CloudWatch alarm
  // (alpha-infra#698) matches `event` and `verdict` exactly; renaming either
  // silences the alarm rather than failing it, so tell infra first.
  | "security_event";

export function writeBusinessLog(
  logType: BusinessLogType,
  fields: Record<string, unknown>,
): void {
  process.stdout.write(
    `${JSON.stringify({ log_type: logType, ...fields, logged_at: new Date().toISOString() })}\n`,
  );
}
