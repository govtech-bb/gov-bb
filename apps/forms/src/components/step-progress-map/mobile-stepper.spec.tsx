/**
 * mobile-stepper.spec.tsx
 *
 * Component tests for the mobile collapsible stepper. Node-level navigation
 * rules (done=button/current=aria-current/locked=aria-disabled) are shared
 * with the desktop layout via progress-node.tsx and are covered exhaustively
 * in desktop-map.spec.tsx — these tests focus on what's specific to this
 * layout: the collapsed bar, the segmented meter, the accordion toggle, and
 * always-expanded repeatable branches.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileStepper } from "./mobile-stepper";
import type { ProgressModel } from "./types";

describe("MobileStepper", () => {
  it("renders a nav landmark labelled 'Form progress' with a collapsed bar showing the current step title", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      { kind: "step", id: "b", label: "Step B", state: "current" },
    ];
    render(
      <MobileStepper
        model={model}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Form progress" }),
    ).toBeInTheDocument();
    const bar = screen.getByRole("button", { name: /Step B/ });
    expect(bar).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles aria-expanded and reveals the full list on tap, hiding it again on a second tap", async () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      { kind: "step", id: "b", label: "Step B", state: "current" },
    ];
    render(
      <MobileStepper
        model={model}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );

    const bar = screen.getByRole("button", { name: /Step B/ });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Step A")).toBeInTheDocument();

    await userEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Step A")).not.toBeInTheDocument();
  });

  it("renders one meter segment per node with a class matching each node's state", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      { kind: "step", id: "b", label: "Step B", state: "current" },
      { kind: "step", id: "c", label: "Step C", state: "locked" },
    ];
    const { container } = render(
      <MobileStepper
        model={model}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );

    const segments = container.querySelectorAll(
      ".step-progress-map__meter-segment",
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toHaveClass("step-progress-map__meter-segment--done");
    expect(segments[1]).toHaveClass(
      "step-progress-map__meter-segment--current",
    );
    expect(segments[2]).toHaveClass("step-progress-map__meter-segment--locked");
  });

  it("collapses again after a successful onNavigate tap", async () => {
    const onNavigate = vi.fn();
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      { kind: "step", id: "b", label: "Step B", state: "current" },
    ];
    render(
      <MobileStepper
        model={model}
        enteringIds={new Set()}
        onNavigate={onNavigate}
      />,
    );

    const bar = screen.getByRole("button", { name: /Step B/ });
    await userEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");

    const doneButton = screen.getByRole("button", { name: "Step A" });
    await userEvent.click(doneButton);

    expect(onNavigate).toHaveBeenCalledWith("a");
    expect(bar).toHaveAttribute("aria-expanded", "false");
  });

  it("always shows repeatable instances indented under their parent group once expanded, regardless of where the current step is", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      {
        kind: "group",
        id: "dependents",
        label: "Dependents",
        state: "done",
        instances: [
          { stepId: "dependents", label: "Dependents", state: "done" },
          { stepId: "dependents~1", label: "Dependents 2", state: "done" },
        ],
      },
      { kind: "step", id: "c", label: "Step C", state: "current" },
    ];
    render(
      <MobileStepper
        model={model}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );

    const bar = screen.getByRole("button", { name: /Step C/ });
    return userEvent.click(bar).then(() => {
      // Both instances render — mobile never collapses a group to a count.
      expect(screen.getByText("Dependents")).toBeInTheDocument();
      expect(screen.getByText("Dependents 2")).toBeInTheDocument();
      expect(screen.queryByText("2")).not.toBeInTheDocument();
    });
  });
});
