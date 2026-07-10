import { Injectable } from "@nestjs/common";
import { SERVICES_INDEX } from "./services-index.generated";
import type { ServiceIndexEntry } from "./service-index.type";

/** Keep only public entries unless non-public (preview/draft) are requested. */
export function filterVisible(
  entries: ServiceIndexEntry[],
  includeNonPublic: boolean,
): ServiceIndexEntry[] {
  return includeNonPublic
    ? entries
    : entries.filter((e) => e.visibility === "public");
}

@Injectable()
export class ContentService {
  /**
   * The services index. `includeNonPublic` gates preview/draft services — the
   * controller sets it true only for an authenticated admin request.
   */
  list(includeNonPublic: boolean): ServiceIndexEntry[] {
    return filterVisible(SERVICES_INDEX, includeNonPublic);
  }
}
