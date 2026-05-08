import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";

export function today(): string {
  return DateTime.now().setZone(DEFAULT_ZONE).toISODate() ?? "";
}
