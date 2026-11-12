export * from "./types";
export * from "./dates";
export * from "./metrics";
export * from "./funnels";
export * from "./periods";
export * from "./umami";
// Re-export the shared event-name helpers (#2682) so the dashboard can build
// query names and classify stored names identically to how the forms app emits
// them.
export {
  eventName,
  eventFormKey,
  canonicalEvent,
  stepFromEvent,
} from "@govtech-bb/analytics";
// The tool IDs landing sends in its tool events (ADR 0079), so the dashboard's
// tool list is checked against them.
export type { ToolId } from "@govtech-bb/analytics";
