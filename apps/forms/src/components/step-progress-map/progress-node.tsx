// Shared node rendering for the step progress "route map". Both desktop-map
// and mobile-stepper render nodes with the same navigation rules from the
// design doc's Accessibility section:
//   done    -> a real <button>, click calls onNavigate(id)
//   current -> aria-current="step", non-interactive
//   locked  -> non-interactive, aria-disabled, out of the tab order
//             (rendered as a span, never a disabled <button>)
//
// Marker content (mockup "node anatomy"):
//   done    -> a bold check
//   current -> empty (no number) for a main-line node; branch instances show
//              their ordinal in blue instead (showOrdinalWhenCurrent)
//   locked  -> the node's 1-based ordinal position (aria-hidden; the
//              accessible name stays the label text)
//   variant "review" (the terminal Review & submit node) overrides all of
//   the above except done: a flag stands in for the ordinal/empty marker.

import React from "react";
import type { ProgressNodeState } from "./types";

export function classNames(
  ...parts: Array<string | false | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

function markerContent(
  state: ProgressNodeState,
  ordinal: number,
  variant: "review" | undefined,
  showOrdinalWhenCurrent: boolean,
): React.ReactNode {
  if (state === "done") return "✓";
  if (variant === "review") return "🏁";
  if (state === "current") return showOrdinalWhenCurrent ? ordinal : null;
  return ordinal;
}

export interface NodeButtonProps {
  id: string;
  label: string;
  state: ProgressNodeState;
  // 1-based position of this node among its siblings (main line: the node
  // list, a repeatable group counting as one slot; branch: among instances).
  ordinal: number;
  variant?: "review";
  // Branch instances show their ordinal even while current; main-line nodes
  // stay empty when current (design doc "node anatomy").
  showOrdinalWhenCurrent?: boolean;
  onNavigate: (stepId: string) => void;
}

export function NodeButton({
  id,
  label,
  state,
  ordinal,
  variant,
  showOrdinalWhenCurrent = false,
  onNavigate,
}: NodeButtonProps) {
  const className = classNames(
    "step-progress-map__node",
    `step-progress-map__node--${state}`,
  );
  const marker = (
    <span className="step-progress-map__marker" aria-hidden="true">
      {markerContent(state, ordinal, variant, showOrdinalWhenCurrent)}
    </span>
  );
  const labelSpan = <span className="step-progress-map__label">{label}</span>;

  if (state === "done") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onNavigate(id)}
      >
        {marker}
        {labelSpan}
      </button>
    );
  }

  if (state === "current") {
    return (
      <span className={className} aria-current="step">
        {marker}
        {labelSpan}
      </span>
    );
  }

  return (
    <span className={className} aria-disabled="true">
      {marker}
      {labelSpan}
    </span>
  );
}

// The header node for a collapsed repeatable group: shows the instance count
// and is clickable (to the first instance) when done. When the current step
// is inside a group the layouts render the branch instances directly instead
// of this header, so it is never itself current.
export interface GroupHeaderProps {
  id: string;
  label: string;
  state: ProgressNodeState;
  count: number;
  onNavigate: (stepId: string) => void;
}

export function GroupHeader({
  id,
  label,
  state,
  count,
  onNavigate,
}: GroupHeaderProps) {
  const className = classNames(
    "step-progress-map__node",
    "step-progress-map__node--group",
    `step-progress-map__node--${state}`,
  );
  const marker = (
    <span className="step-progress-map__marker" aria-hidden="true">
      {count}
    </span>
  );
  // The count badge is aria-hidden, so repeat it as visually-hidden text —
  // otherwise assistive tech never hears that this node stands for multiple
  // repeatable entries.
  const labelSpan = (
    <span className="step-progress-map__label">
      {label}
      <span className="govbb-visually-hidden">, {count} entries</span>
    </span>
  );

  if (state === "done") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onNavigate(id)}
      >
        {marker}
        {labelSpan}
      </button>
    );
  }

  return (
    <span
      className={className}
      aria-disabled={state === "locked" ? "true" : undefined}
    >
      {marker}
      {labelSpan}
    </span>
  );
}
