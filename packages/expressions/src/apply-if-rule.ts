import jsonLogic from "json-logic-js";
import type { ResolutionContext } from "./types";

// jsonLogic.is_logic is structural — true for ANY single-key plain object —
// so a literal like `{ name: "Alice" }` passes the check and crashes inside
// apply(). The catch turns that into pass-through.
export function applyIfRule(value: unknown, ctx: ResolutionContext): unknown {
  if (!jsonLogic.is_logic(value)) {
    return value;
  }
  try {
    return jsonLogic.apply(value as Parameters<typeof jsonLogic.apply>[0], ctx);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Unrecognized operation")
    ) {
      return value;
    }
    throw err;
  }
}
