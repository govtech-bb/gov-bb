// Desktop horizontal route map (>=48rem). See the design doc's "Presentation
// & responsiveness" section: nodes on a horizontal line joined by a metro
// line connector; a repeatable group collapses to a single counted node
// unless the current step is inside it, in which case its own node stays on
// the line as the current-blue anchor, with a branch panel of numbered
// instances hanging underneath it.

import React from "react";
import type { ProgressModel } from "./types";
import { NodeButton, GroupHeader, classNames } from "./progress-node";

export interface DesktopMapProps {
  model: ProgressModel;
  enteringIds: Set<string>;
  onNavigate: (stepId: string) => void;
}

export function DesktopMap({
  model,
  enteringIds,
  onNavigate,
}: DesktopMapProps) {
  return (
    <nav
      aria-label="Form progress"
      className="step-progress-map step-progress-map--desktop"
    >
      <ol className="step-progress-map__list">
        {model.map((node, index) => {
          const isLast = index === model.length - 1;
          const isEntering = enteringIds.has(node.id);
          const ordinal = index + 1;
          const expanded = node.kind === "group" && node.state === "current";
          const connector = !isLast && (
            <span
              className={classNames(
                "step-progress-map__connector",
                node.state === "done" && "step-progress-map__connector--done",
              )}
              aria-hidden="true"
            />
          );

          return (
            <li
              key={node.id}
              className={classNames(
                "step-progress-map__item",
                isEntering && "step-progress-map__item--entering",
              )}
            >
              <div className="step-progress-map__node-row">
                {node.kind === "group" ? (
                  expanded ? (
                    <div className="step-progress-map__node-column">
                      <NodeButton
                        id={node.id}
                        label={node.label}
                        state="current"
                        ordinal={ordinal}
                        onNavigate={onNavigate}
                      />
                      <span
                        className="step-progress-map__branch-stem"
                        aria-hidden="true"
                      />
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
                              onNavigate={onNavigate}
                            />
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <GroupHeader
                      id={node.instances?.[0]?.stepId ?? node.id}
                      label={node.label}
                      state={node.state}
                      count={node.instances?.length ?? 0}
                      onNavigate={onNavigate}
                    />
                  )
                ) : (
                  <NodeButton
                    id={node.id}
                    label={node.label}
                    state={node.state}
                    ordinal={ordinal}
                    variant={node.variant}
                    onNavigate={onNavigate}
                  />
                )}
                {connector}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
