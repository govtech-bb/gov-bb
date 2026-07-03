// Types for the step progress "route map" pure model builder.
// See docs/superpowers/specs/2026-07-02-forms-step-progress-map-design.md.

export type ProgressNodeState = "done" | "current" | "locked";

// A single repeatable instance rendered as a branch sub-node under a group.
export interface ProgressNodeInstance {
  stepId: string;
  label: string;
  state: ProgressNodeState;
}

// A node in the map: either one visible step, or a repeatable group whose
// instances are the branch sub-nodes.
export interface ProgressNode {
  kind: "step" | "group";
  // The stepId navigation targets; for a group, the base id.
  id: string;
  label: string;
  state: ProgressNodeState;
  // Only present when kind is "group".
  instances?: ProgressNodeInstance[];
}

export type ProgressModel = ProgressNode[];
