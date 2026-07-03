// Shared node rendering for the step progress "route map". Both desktop-map
// and mobile-stepper render nodes with the same navigation rules from the
// design doc's Accessibility section:
//   done    -> a real <button>, click calls onNavigate(id)
//   current -> aria-current="step", non-interactive
//   locked  -> non-interactive, aria-disabled, out of the tab order
//             (rendered as a span, never a disabled <button>)

import React from "react";
import type { ProgressNodeState } from "./types";

export function classNames(
  ...parts: Array<string | false | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export interface NodeButtonProps {
  id: string;
  label: string;
  state: ProgressNodeState;
  onNavigate: (stepId: string) => void;
}

export function NodeButton({ id, label, state, onNavigate }: NodeButtonProps) {
  const className = classNames(
    "step-progress-map__node",
    `step-progress-map__node--${state}`,
  );
  const marker = (
    <span className="step-progress-map__marker" aria-hidden="true">
      {state === "done" ? "✓" : null}
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

// The header node for a repeatable group. Collapsed (expanded=false) shows
// an instance count and is clickable (to the first instance) when done.
// Expanded (the current step is inside the group) drops the count — the
// individual branch instances carry the state/navigation instead — and is
// never itself a button or aria-current, since it isn't a distinct step.
export interface GroupHeaderProps {
  id: string;
  label: string;
  state: ProgressNodeState;
  count: number;
  expanded: boolean;
  onNavigate: (stepId: string) => void;
}

export function GroupHeader({
  id,
  label,
  state,
  count,
  expanded,
  onNavigate,
}: GroupHeaderProps) {
  const className = classNames(
    "step-progress-map__node",
    "step-progress-map__node--group",
    `step-progress-map__node--${state}`,
  );
  const marker = (
    <span className="step-progress-map__marker" aria-hidden="true">
      {expanded ? null : count}
    </span>
  );
  const labelSpan = <span className="step-progress-map__label">{label}</span>;

  if (!expanded && state === "done") {
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
