import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "./api-client";
import { requireSession } from "./auth/require-session";

/**
 * Editing-presence server fns (read-only lock, #874). These are the SSR bridge
 * between the builder UI and the form_builder_api presence routes: the API has
 * only the shared admin token and no user concept, so the identity that owns a
 * claim is stamped here from `session.login`.
 *
 * The hook (`-use-presence.ts`) calls `claimPresence` on load and as a
 * heartbeat, polls `getPresence`, and best-effort `releasePresence` on leave.
 */

/** The current holder of a form's editing claim, as the API reports it. */
export interface PresenceHolder {
  userLogin: string;
  claimedAt: string;
  lastActivityAt: string;
}

/** PUT result: whether *I* now hold the claim, and who currently holds it. */
export interface PresenceClaim {
  held: boolean;
  holder: PresenceHolder | null;
}

// Claim or heartbeat the editing lock for a form. Idempotent for the holder
// (heartbeat); a non-holder gets `held: false` and the current holder so the
// client can go read-only. The API stamps activity, so calling this on a 60s
// interval keeps the claim fresh.
export const claimPresence = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<PresenceClaim> => {
    return api.put<PresenceClaim>(
      `/builder/forms/${encodeURIComponent(data.formId)}/presence`,
      { userLogin: context.session.login },
    );
  });

// Read the current fresh holder of a form's claim (or null). Used by the poll
// to detect both "someone else took over" and "the claim went free".
export const getPresence = createServerFn({ method: "GET", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ holder: PresenceHolder | null }> => {
    return api.get<{ holder: PresenceHolder | null }>(
      `/builder/forms/${encodeURIComponent(data.formId)}/presence`,
    );
  });

// Best-effort release of my claim on leave. The API only deletes the row if
// it's mine, so this is safe to fire on route-leave/beforeunload; the 15-minute
// TTL is the real guarantee if it never lands.
export const releasePresence = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<{ released: boolean }> => {
    return api.del<{ released: boolean }>(
      `/builder/forms/${encodeURIComponent(data.formId)}/presence`,
      { userLogin: context.session.login },
    );
  });
