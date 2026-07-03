/**
 * index.spec.tsx
 *
 * Container-level tests for StepProgressMap. Model derivation itself is
 * covered by build-progress-model.spec.ts, and per-node rendering rules are
 * covered by desktop-map.spec.tsx / mobile-stepper.spec.tsx — these tests
 * cover what only exists at this level: the model-length hide rule, the
 * previous-render diff that drives the entering animation, and the fact that
 * both layouts mount together (CSS — not the container — decides which one
 * is visible).
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StepProgressMap } from "./index";
import type { ClientFormStep } from "@forms/types";

function makeStep(stepId: string, title: string): ClientFormStep {
  return { stepId, title, fields: [] };
}

describe("StepProgressMap", () => {
  it("renders nothing when the model has fewer than 2 nodes", () => {
    const { container } = render(
      <StepProgressMap
        visibleSteps={[makeStep("a", "Step A")]}
        currentStepId="a"
        completedStepIds={[]}
        resolveTitle={(step) => step.title}
        onNavigate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders both the desktop and mobile nav landmarks (CSS decides which is visible)", () => {
    render(
      <StepProgressMap
        visibleSteps={[makeStep("a", "Step A"), makeStep("b", "Step B")]}
        currentStepId="a"
        completedStepIds={[]}
        resolveTitle={(step) => step.title}
        onNavigate={vi.fn()}
      />,
    );
    const navs = screen.getAllByRole("navigation", { name: "Form progress" });
    expect(navs).toHaveLength(2);
  });

  it("flags a newly-appeared step with the entering class on the render after it appears", () => {
    const baseSteps = [makeStep("a", "Step A"), makeStep("b", "Step B")];
    const { container, rerender } = render(
      <StepProgressMap
        visibleSteps={baseSteps}
        currentStepId="a"
        completedStepIds={[]}
        resolveTitle={(step) => step.title}
        onNavigate={vi.fn()}
      />,
    );

    // No entering nodes on first mount.
    expect(
      container.querySelector(".step-progress-map__item--entering"),
    ).not.toBeInTheDocument();

    // A conditional step appears between "a" and "b".
    rerender(
      <StepProgressMap
        visibleSteps={[
          makeStep("a", "Step A"),
          makeStep("new", "New Step"),
          makeStep("b", "Step B"),
        ]}
        currentStepId="a"
        completedStepIds={[]}
        resolveTitle={(step) => step.title}
        onNavigate={vi.fn()}
      />,
    );

    const desktopNav = screen.getAllByRole("navigation", {
      name: "Form progress",
    })[0];
    const enteringItem = desktopNav.querySelector(
      ".step-progress-map__item--entering",
    );
    expect(enteringItem).toBeInTheDocument();
    expect(enteringItem).toHaveTextContent("New Step");
  });
});
