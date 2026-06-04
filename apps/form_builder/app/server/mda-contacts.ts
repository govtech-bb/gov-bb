import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api } from "./api-client";
import { requireSession } from "./auth/require-session";
import type { MdaContact } from "../types/index";

/**
 * Server-function wrappers for the per-environment MDA contact directory
 * (issue #607), mirroring forms.ts. All data access goes through the
 * form_builder_api ALB via api-client (X-Admin-Token / BUILDER_API_URL).
 */

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  country: z.string().optional(),
});

// List every MDA contact for the dropdown. The API returns the full directory;
// the builder filters/labels client-side.
export const listMdaContacts = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<MdaContact[]> => {
    return api.get<MdaContact[]>("/builder/mda-contacts");
  });

// Create a new MDA contact and return the created row (with its server-assigned
// id). The "Create new" affordance in the contact-details editor selects the
// returned contact immediately after.
export const createMdaContact = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      label: z.string().min(1),
      title: z.string().min(1),
      telephone: z.string().min(1),
      email: z.string().email(),
      address: addressSchema.optional(),
      mdaEmail: z.string().email(),
    }),
  )
  .handler(async ({ data }): Promise<MdaContact> => {
    return api.post<MdaContact>("/builder/mda-contacts", data);
  });
