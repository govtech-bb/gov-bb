// Mobile collapsible stepper (<48rem). See the design doc's "Presentation &
// responsiveness" section: starts collapsed as a slim sticky bar with a
// segmented meter; tapping expands inline (accordion) into the full vertical
// list. Unlike the desktop route map, repeatable groups are never collapsed
// to a count here — the list is already vertical, so all instances show,
// indented under their parent, whenever the list itself is open.

import React, { useId, useState } from "react";
import type { ProgressModel } from "./types";
import { NodeButton, classNames } from "./progress-node";

export interface MobileStepperProps {
  model: ProgressModel;
  enteringIds: Set<string>;
  onNavigate: (stepId: string) => void;
}

function getCurrentLabel(model: ProgressModel): string {
  for (const node of model) {
    if (node.kind === "group") {
      const currentInstance = node.instances?.find(
        (instance) => instance.state === "current",
      );
      if (currentInstance) return currentInstance.label;
      continue;
    }
    if (node.state === "current") return node.label;
  }
  return "";
}

export function MobileStepper({
  model,
  enteringIds,
  onNavigate,
}: MobileStepperProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const handleNavigate = (stepId: string) => {
    onNavigate(stepId);
    setExpanded(false);
  };

  return (
    <nav
      aria-label="Form progress"
      className="step-progress-map step-progress-map--mobile"
    >
      <button
        type="button"
        className="step-progress-map__bar"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="step-progress-map__bar-title">
          {getCurrentLabel(model)}
        </span>
        <span className="step-progress-map__chevron" aria-hidden="true" />
      </button>
      <div className="step-progress-map__meter" aria-hidden="true">
        {model.map((node) => (
          <span
            key={node.id}
            className={classNames(
              "step-progress-map__meter-segment",
              `step-progress-map__meter-segment--${node.state}`,
            )}
          />
        ))}
      </div>
      {/* Rendered collapsed (hidden) rather than unmounted so the toggle's
          aria-controls always references an element that exists. */}
      <ol id={listId} className="step-progress-map__list" hidden={!expanded}>
        {model.map((node) => {
          const isEntering = enteringIds.has(node.id);

          return (
            <li
              key={node.id}
              className={classNames(
                "step-progress-map__item",
                isEntering && "step-progress-map__item--entering",
              )}
            >
              {node.kind === "group" ? (
                // Repeatable groups are always shown as their full,
                // indented instance list on mobile (never collapsed to a
                // count) — there is no separate group header node, since
                // it would duplicate the first instance's label.
                <ol className="step-progress-map__branch">
                  {node.instances?.map((instance) => (
                    <li
                      key={instance.stepId}
                      className="step-progress-map__item"
                    >
                      <NodeButton
                        id={instance.stepId}
                        label={instance.label}
                        state={instance.state}
                        onNavigate={handleNavigate}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <NodeButton
                  id={node.id}
                  label={node.label}
                  state={node.state}
                  onNavigate={handleNavigate}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
