// Events for the interactive tools on landing (ADR 0079). Every tool sends the
// same four event names, with the tool and what happened in the event data, so
// one dashboard view covers them all.
//
// Privacy: send only counts, yes/no flags, parishes and IDs defined in code.
// Never send an amount entered or computed (pay, salary, a pension estimate),
// an email address, coordinates or distances, or text typed into a tool.

export type ToolId =
  | "pharmacy-finder"
  | "shelter-finder"
  | "water-outages"
  | "crop-over-permits"
  | "severance-calculator"
  | "nis-self-employed"
  | "pension-calculator"
  | "bank-holidays";

/** The extra tool-result data each tool may send. A list such as `parishes`
 *  is a comma-separated string of codes. */
export interface ToolResultData {
  "pharmacy-finder": {
    parishes?: string;
    type?: string;
    slip?: string;
    subsidised_only?: boolean;
    open_now?: boolean;
    has_query?: boolean;
    used_location?: boolean;
  };
  "shelter-finder": {
    parishes?: string;
    categories?: string;
    amenities?: number;
    sort?: string;
    has_query?: boolean;
    used_location?: boolean;
  };
  "water-outages": {
    step?: string;
    parish?: string;
    chosen_by?: string;
    active_notices?: number;
    past_notices?: number;
  };
  "crop-over-permits": { event?: string; venue?: string; permits?: number };
  "severance-calculator": { reason?: string };
  "nis-self-employed": { plan?: string };
  "pension-calculator": Record<never, never>;
  "bank-holidays": Record<never, never>;
}

/** tool-result, typed per tool: a prop another tool owns fails type-check. */
export type ToolResult = {
  [T in ToolId]: {
    tool: T;
    outcome: string;
    results?: number;
  } & ToolResultData[T];
}[ToolId];

export interface ToolTrackingData {
  /** A step or question of a tool was shown. */
  "tool-step-view": { tool: ToolId; step: string };
  /** A tool settled on a result, such as a search, an estimate or a sign-up. */
  "tool-result": ToolResult;
  /** A link or button in a tool was used. `target` is an ID defined in code,
   *  never a URL that can hold user data. */
  "tool-action": {
    tool: ToolId;
    action: string;
    target?: string;
    /** The step or page the action was on, for a tool that has more than one. */
    step?: string;
  };
  /** A tool could not do what was asked, such as a refused location. */
  "tool-error": { tool: ToolId; error: string; step?: string };
}
