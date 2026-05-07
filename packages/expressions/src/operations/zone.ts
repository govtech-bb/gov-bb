// Single source of truth for "what timezone do dates mean in this system."
// Civic forms run in Barbados. Server may be deployed elsewhere; this constant
// pins the wall-clock semantics for "today", age computation, and day diffs.
export const DEFAULT_ZONE = "America/Barbados";
