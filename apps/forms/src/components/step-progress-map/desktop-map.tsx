// Desktop horizontal route map (>=48rem). See the design doc's "Presentation
// & responsiveness" section: nodes on a horizontal line joined by a metro
// line connector; a repeatable group collapses to a single counted node
// unless the current step is inside it, in which case it expands into an
// indented branch of numbered sub-nodes.

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
          const expanded = node.kind === "group" && node.state === "current";

          return (
            <li
              key={node.id}
              className={classNames(
                "step-progress-map__item",
                isEntering && "step-progress-map__item--entering",
              )}
            >
              {node.kind === "group" && expanded ? (
                // Expanded: the group's own header is dropped so the numbered
                // instances aren't duplicated against it (the first instance
                // shares the group's label) — the branch takes the group's
                // place on the line.
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
                        onNavigate={onNavigate}
                      />
                    </li>
                  ))}
                  {!isLast && (
                    <span
                      className="step-progress-map__connector"
                      aria-hidden="true"
                    />
                  )}
                </ol>
              ) : (
                <div className="step-progress-map__node-row">
                  {node.kind === "group" ? (
                    <GroupHeader
                      id={node.instances?.[0]?.stepId ?? node.id}
                      label={node.label}
                      state={node.state}
                      count={node.instances?.length ?? 0}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <NodeButton
                      id={node.id}
                      label={node.label}
                      state={node.state}
                      onNavigate={onNavigate}
                    />
                  )}
                  {!isLast && (
                    <span
                      className={classNames(
                        "step-progress-map__connector",
                        node.state === "done" &&
                          "step-progress-map__connector--done",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
