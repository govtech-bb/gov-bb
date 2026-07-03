// Step progress "route map" — see
// docs/superpowers/specs/2026-07-02-forms-step-progress-map-design.md.
//
// One responsive component, two layouts (desktop-map / mobile-stepper)
// rendered from the same model; CSS decides which one is visible (never this
// container — see govtech.css). The mount site decides *when* to render this
// component at all (hidden on intro/check-your-answers/submission-confirmation);
// this container only hides itself when the model is too small to be useful.

import React, { useEffect, useMemo, useRef } from "react";
import type { ClientFormStep } from "@forms/types";
import { buildProgressModel } from "./build-progress-model";
import type { ProgressModel } from "./types";
import { DesktopMap } from "./desktop-map";
import { MobileStepper } from "./mobile-stepper";

export interface StepProgressMapProps {
  visibleSteps: ClientFormStep[];
  currentStepId: string;
  completedStepIds: string[];
  resolveTitle: (step: ClientFormStep) => string;
  onNavigate: (stepId: string) => void;
}

export function StepProgressMap({
  visibleSteps,
  currentStepId,
  completedStepIds,
  resolveTitle,
  onNavigate,
}: StepProgressMapProps) {
  const model: ProgressModel = useMemo(
    () =>
      buildProgressModel(
        visibleSteps,
        currentStepId,
        completedStepIds,
        resolveTitle,
      ),
    [visibleSteps, currentStepId, completedStepIds, resolveTitle],
  );

  // Tracks the node ids seen at the last commit so a node that appears
  // between renders (e.g. a conditional step becoming visible) can be
  // flagged for the brief entering animation (design doc, Animation
  // section). Held in a ref (not state) updated from an effect: mutating a
  // ref doesn't itself trigger a re-render, so the entering class computed
  // for *this* commit survives — using state here would schedule another
  // render that settles the "entering" set back to empty before the browser
  // (or a test) ever observes it.
  const previousIdsRef = useRef<string[]>(model.map((node) => node.id));

  const enteringIds = useMemo(() => {
    const currentIds = model.map((node) => node.id);
    return new Set(
      currentIds.filter((id) => !previousIdsRef.current.includes(id)),
    );
  }, [model]);

  useEffect(() => {
    previousIdsRef.current = model.map((node) => node.id);
  }, [model]);

  if (model.length < 2) return null;

  return (
    <>
      <DesktopMap
        model={model}
        enteringIds={enteringIds}
        onNavigate={onNavigate}
      />
      <MobileStepper
        model={model}
        enteringIds={enteringIds}
        onNavigate={onNavigate}
      />
    </>
  );
}
