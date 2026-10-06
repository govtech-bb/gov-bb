import { $getState, $setState, createState, type LexicalNode } from "lexical";
import type { Setting, Settings } from "./settings";

export const settingsState = createState("settings", {
  parse: (v): Settings => {
    // SAFETY: NodeState imports JSON. Keep the raw object, including incomplete values,
    // so field readers can validate it and authors can repair drafts before export.
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Settings) : {};
  },
});

export const $settings = (node: LexicalNode) => $getState(node, settingsState);

/** Persistent block identity for saved forms, conditional logic and answer references; independent of Lexical session keys. */
export const blockIdState = createState("id", { parse: (v) => (typeof v === "string" ? v : "") });

export const $blockId = (node: LexicalNode) => $getState(node, blockIdState);

/** Merges a patch into a block's settings; undefined or false removes a key. */
export function $setSettings<T extends LexicalNode>(
  node: T,
  patch: Partial<Record<string, Setting | undefined>>,
): T {
  return $setState(node, settingsState, (prev) => {
    const next = { ...prev };

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === false) delete next[key];
      else next[key] = value;
    }

    return next;
  });
}

export const depthState = createState("depth", {
  parse: (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : -1),
});

export const $depth = (node: LexicalNode) => Math.max(0, $getState(node, depthState));

export const $setDepth = <T extends LexicalNode>(node: T, depth: number): T =>
  $setState(node, depthState, Math.max(0, depth));
