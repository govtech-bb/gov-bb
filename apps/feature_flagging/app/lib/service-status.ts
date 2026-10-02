/**
 * The three service-visibility states, mirroring the api's `service_status_enum`
 * (apps/api). Redeclared here rather than imported so this frontend app has no
 * build-time dependency on the NestJS api package.
 *
 * - `enabled`       — page + form live.
 * - `form_disabled` — page visible, form unreachable (maintenance).
 * - `disabled`      — whole service hidden (preview-only).
 */
export type ServiceStatus = "enabled" | "form_disabled" | "disabled";

export const SERVICE_STATUS_VALUES: readonly ServiceStatus[] = [
  "enabled",
  "form_disabled",
  "disabled",
];

/**
 * Absence of a service_status row defaults to `disabled` (fail-closed), matching
 * the api's `/services` contract: an unseeded service maps to `preview` there
 * (apps/api/src/content/content.service.ts) and so is hidden from the public.
 * The admin console must report the same hidden state rather than showing an
 * unseeded service as live. See #2003.
 */
export const DEFAULT_STATUS: ServiceStatus = "disabled";

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  enabled: "Enabled",
  form_disabled: "Form disabled",
  disabled: "Disabled",
};

export function isServiceStatus(v: unknown): v is ServiceStatus {
  return v === "enabled" || v === "form_disabled" || v === "disabled";
}
