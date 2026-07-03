// Pure model builder for the step progress "route map".
// See docs/superpowers/specs/2026-07-02-forms-step-progress-map-design.md.
//
// Consumes the exact `visibleSteps` array the renderer already computes
// (getVisibleSteps) — this module never re-derives visibility itself.

import type { ClientFormStep } from "@forms/types";
import {
  getInstanceMarker,
  getRepeatStepCount,
  repeatStepConcactenator,
} from "@forms/lib";
import type {
  ProgressModel,
  ProgressNode,
  ProgressNodeInstance,
  ProgressNodeState,
} from "./types";

// Mirrors the conventional non-content step ids from review.tsx:23-28.
export const NON_CONTENT_STEP_IDS = [
  "intro",
  "check-your-answers",
  "declaration",
  "submission-confirmation",
] as const;

// intro/submission-confirmation produce no node at all.
const HIDDEN_STEP_IDS: readonly string[] = ["intro", "submission-confirmation"];
// check-your-answers + declaration collapse into one "Review & submit" node.
const REVIEW_STEP_IDS: readonly string[] = [
  "check-your-answers",
  "declaration",
];
const REVIEW_NODE_ID = "check-your-answers";

const defaultResolveTitle = (step: ClientFormStep): string => step.title;

const getBaseStepId = (stepId: string): string => {
  const parts = stepId.split(repeatStepConcactenator);
  return parts.length <= 1
    ? stepId
    : parts.slice(0, -1).join(repeatStepConcactenator);
};

const isRepeatable = (step: ClientFormStep): boolean =>
  step.behaviours?.some((b) => b.type === "repeatable") ?? false;

const nodeState = (
  stepId: string,
  currentStepId: string,
  completed: Set<string>,
): ProgressNodeState => {
  if (stepId === currentStepId) return "current";
  if (completed.has(stepId)) return "done";
  return "locked";
};

const buildInstanceLabel = (
  step: ClientFormStep,
  resolveTitle: (step: ClientFormStep) => string,
): string => {
  const marker = getInstanceMarker(step);
  if (!marker) return resolveTitle(step);
  return marker.hasLabel ? marker.text : `${resolveTitle(step)} ${marker.text}`;
};

const buildGroupNode = (
  groupSteps: ClientFormStep[],
  currentStepId: string,
  completed: Set<string>,
  resolveTitle: (step: ClientFormStep) => string,
): ProgressNode => {
  const instances: ProgressNodeInstance[] = groupSteps.map((step) => ({
    stepId: step.stepId,
    label: buildInstanceLabel(step, resolveTitle),
    state: nodeState(step.stepId, currentStepId, completed),
  }));

  const state: ProgressNodeState = instances.some((i) => i.state === "current")
    ? "current"
    : instances.every((i) => i.state === "done")
      ? "done"
      : "locked";

  return {
    kind: "group",
    id: groupSteps[0].stepId,
    label: resolveTitle(groupSteps[0]),
    state,
    instances,
  };
};

const buildReviewNode = (
  visibleSteps: ClientFormStep[],
  currentStepId: string,
  completed: Set<string>,
): ProgressNode => {
  const constituentIds = REVIEW_STEP_IDS.filter((id) =>
    visibleSteps.some((s) => s.stepId === id),
  );
  const state: ProgressNodeState = REVIEW_STEP_IDS.includes(currentStepId)
    ? "current"
    : constituentIds.every((id) => completed.has(id))
      ? "done"
      : "locked";

  return {
    kind: "step",
    id: REVIEW_NODE_ID,
    label: "Review & submit",
    state,
  };
};

export const buildProgressModel = (
  visibleSteps: ClientFormStep[],
  currentStepId: string,
  completedStepIds: string[],
  resolveTitle: (step: ClientFormStep) => string = defaultResolveTitle,
): ProgressModel => {
  const completed = new Set(completedStepIds);
  const nodes: ProgressNode[] = [];
  let reviewNodeAdded = false;

  let i = 0;
  while (i < visibleSteps.length) {
    const step = visibleSteps[i];
    const stepId = step.stepId;

    if (HIDDEN_STEP_IDS.includes(stepId)) {
      i++;
      continue;
    }

    if (REVIEW_STEP_IDS.includes(stepId)) {
      if (!reviewNodeAdded) {
        nodes.push(buildReviewNode(visibleSteps, currentStepId, completed));
        reviewNodeAdded = true;
      }
      i++;
      continue;
    }

    const count = getRepeatStepCount(stepId);
    if (count === 0 && isRepeatable(step)) {
      const baseId = stepId;
      const groupSteps = [step];
      let j = i + 1;
      while (j < visibleSteps.length) {
        const nextStep = visibleSteps[j];
        const nextCount = getRepeatStepCount(nextStep.stepId);
        if (
          nextCount !== undefined &&
          nextCount > 0 &&
          getBaseStepId(nextStep.stepId) === baseId
        ) {
          groupSteps.push(nextStep);
          j++;
        } else {
          break;
        }
      }
      nodes.push(
        buildGroupNode(groupSteps, currentStepId, completed, resolveTitle),
      );
      i = j;
      continue;
    }

    nodes.push({
      kind: "step",
      id: stepId,
      label: resolveTitle(step),
      state: nodeState(stepId, currentStepId, completed),
    });
    i++;
  }

  return nodes;
};
