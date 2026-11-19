// The API's global rate limits, per client IP (main.ts trusts the ALB hop, so
// `req.ip` is the client). In their own file so a route that adjusts them can
// build on these numbers rather than repeat them; importing app.module from a
// route would be circular.
export const THROTTLERS = [
  { name: "short", ttl: 10_000, limit: 5 },
  { name: "medium", ttl: 60_000, limit: 60 },
  { name: "long", ttl: 3_600_000, limit: 1_000 },
] as const;

export type ThrottlerName = (typeof THROTTLERS)[number]["name"];
