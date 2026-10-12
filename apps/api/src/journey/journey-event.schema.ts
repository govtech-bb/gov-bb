import { z } from "zod";

// Shape of a first-party journey event sent by the landing and forms sites
// (replacing Umami, see journey.controller.ts).
//
// Event names are built at runtime (`<formId>:form-step-three`,
// `service-<slug>`, `data-umami-event` values), so they are checked by SHAPE,
// not against a fixed list: a fixed list would silently drop real events.

// Lower-case slug characters plus `:` (form-scoped names) and `~` (hashed long
// form ids, see eventFormKey in @govtech-bb/analytics).
const EVENT_NAME = /^[a-z0-9][a-z0-9:~_-]{0,99}$/;
const PROP_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
// A pathname only: no query string or fragment, which can carry tokens.
const PATHNAME = /^\/[^?#\s]{0,299}$/;

export const MAX_PROPS = 20;
export const MAX_EVENTS_PER_REQUEST = 25;

const propValue = z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
]);

export const journeyEventSchema = z
  .object({
    /** Random per-event id, so a retried send can be counted once. */
    id: z.uuid(),
    app: z.enum(["landing", "forms"]),
    event: z.string().regex(EVENT_NAME),
    props: z
      .record(z.string().regex(PROP_KEY), propValue)
      .refine((p) => Object.keys(p).length <= MAX_PROPS, {
        message: `At most ${MAX_PROPS} props`,
      })
      .optional(),
    path: z.string().regex(PATHNAME).optional(),
    /** Random per page load (not stored anywhere), to group one visit's events. */
    page_load_id: z.uuid().optional(),
    client_ts: z.iso.datetime().optional(),
  })
  .strict();

export const journeyRequestSchema = z.union([
  journeyEventSchema,
  z.array(journeyEventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
]);

export type JourneyEvent = z.infer<typeof journeyEventSchema>;
