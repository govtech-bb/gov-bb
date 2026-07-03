// Mobile collapsible stepper (<48rem). See the design doc's "Presentation &
// responsiveness" section: starts collapsed as a slim sticky bar with a
// segmented meter; tapping expands inline (accordion) into the full vertical
// list. Unlike the desktop route map, repeatable groups are never collapsed
// to a count here — the list is already vertical, so all instances show,
// indented under their parent, whenever the list itself is open. When the
// current step is inside the group its own row stays visible above the
// branch (the mockup's "current-blue empty ring" parent row); otherwise no
// header is shown — just the instances — so a non-current group never
// duplicates its first instance's label.

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
        {expanded ? (
          <span className="step-progress-map__bar-header">
            <span className="step-progress-map__bar-heading">
              Your progress
            </span>
            <span className="step-progress-map__chevron" aria-hidden="true" />
          </span>
        ) : (
          <>
            <span className="step-progress-map__bar-top">
              <span
                className="step-progress-map__bar-node"
                aria-hidden="true"
              />
              <span className="step-progress-map__bar-text">
                <span className="step-progress-map__bar-eyebrow">
                  You&rsquo;re on
                </span>
                <span className="step-progress-map__bar-title">
                  {getCurrentLabel(model)}
                </span>
              </span>
              <span className="step-progress-map__chevron" aria-hidden="true" />
            </span>
            <span className="step-progress-map__meter" aria-hidden="true">
              {model.map((node) => (
                <span
                  key={node.id}
                  className={classNames(
                    "step-progress-map__meter-segment",
                    `step-progress-map__meter-segment--${node.state}`,
                  )}
                />
              ))}
            </span>
            <span className="step-progress-map__bar-hint">
              Tap to see all steps
            </span>
          </>
        )}
      </button>
      {/* Rendered collapsed (hidden) rather than unmounted so the toggle's
          aria-controls always references an element that exists. */}
      <ol id={listId} className="step-progress-map__list" hidden={!expanded}>
        {model.map((node, index) => {
          const isEntering = enteringIds.has(node.id);
          const ordinal = index + 1;

          return (
            <li
              key={node.id}
              className={classNames(
                "step-progress-map__item",
                isEntering && "step-progress-map__item--entering",
              )}
            >
              {node.kind === "group" ? (
                <>
                  {node.state === "current" && (
                    <NodeButton
                      id={node.id}
                      label={node.label}
                      state="current"
                      ordinal={ordinal}
                      onNavigate={handleNavigate}
                    />
                  )}
                  {/* Repeatable groups are always shown as their full,
                      indented instance list on mobile (never collapsed to a
                      count). When the group isn't current there is no
                      header above the branch, since it would duplicate the
                      first instance's label. */}
                  <ol className="step-progress-map__branch">
                    {node.instances?.map((instance, instanceIndex) => (
                      <li
                        key={instance.stepId}
                        className="step-progress-map__item"
                      >
                        <NodeButton
                          id={instance.stepId}
                          label={instance.label}
                          state={instance.state}
                          ordinal={instanceIndex + 1}
                          showOrdinalWhenCurrent
                          onNavigate={handleNavigate}
                        />
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <NodeButton
                  id={node.id}
                  label={node.label}
                  state={node.state}
                  ordinal={ordinal}
                  variant={node.variant}
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
