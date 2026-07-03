/**
 * desktop-map.spec.tsx
 *
 * Component tests for the desktop horizontal route map. Takes a pre-built
 * ProgressModel directly (buildProgressModel itself is covered by
 * build-progress-model.spec.ts) so these tests focus purely on rendering +
 * navigation rules from the design doc's Accessibility section.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopMap } from "./desktop-map";
import type { ProgressModel } from "./types";

describe("DesktopMap", () => {
  it("renders a nav landmark labelled 'Form progress' containing an ol", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "current" },
      { kind: "step", id: "b", label: "Step B", state: "locked" },
    ];
    render(
      <DesktopMap model={model} enteringIds={new Set()} onNavigate={vi.fn()} />,
    );

    const nav = screen.getByRole("navigation", { name: "Form progress" });
    expect(nav.querySelector("ol")).toBeInTheDocument();
  });

  it("renders a done node as a button and clicking it fires onNavigate with the step id", async () => {
    const onNavigate = vi.fn();
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      { kind: "step", id: "b", label: "Step B", state: "current" },
    ];
    render(
      <DesktopMap
        model={model}
        enteringIds={new Set()}
        onNavigate={onNavigate}
      />,
    );

    const button = screen.getByRole("button", { name: "Step A" });
    await userEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith("a");
  });

  it("renders the current node with aria-current='step' and it is not a button", async () => {
    const onNavigate = vi.fn();
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "current" },
      { kind: "step", id: "b", label: "Step B", state: "locked" },
    ];
    render(
      <DesktopMap
        model={model}
        enteringIds={new Set()}
        onNavigate={onNavigate}
      />,
    );

    const current = screen.getByText("Step A").closest('[aria-current="step"]');
    expect(current).toBeInTheDocument();
    expect(current?.tagName).not.toBe("BUTTON");

    await userEvent.click(current as Element);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders a locked node as non-interactive, aria-disabled, and out of the tab order", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "current" },
      { kind: "step", id: "b", label: "Step B", state: "locked" },
    ];
    render(
      <DesktopMap model={model} enteringIds={new Set()} onNavigate={vi.fn()} />,
    );

    const locked = screen.getByText("Step B").closest('[aria-disabled="true"]');
    expect(locked).toBeInTheDocument();
    expect(locked?.tagName).not.toBe("BUTTON");
    expect(locked).not.toHaveAttribute("tabindex");
  });

  it("shows a collapsed group as a single node with an instance count, and clicking it navigates to the first instance", async () => {
    const onNavigate = vi.fn();
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "current" },
      {
        kind: "group",
        id: "dependents",
        label: "Dependents",
        state: "done",
        instances: [
          { stepId: "dependents", label: "Dependents", state: "done" },
          { stepId: "dependents~1", label: "Dependents 2", state: "done" },
          { stepId: "dependents~2", label: "Dependents 3", state: "done" },
        ],
      },
    ];
    render(
      <DesktopMap
        model={model}
        enteringIds={new Set()}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    // Only the collapsed group button should exist for "Dependents" — no
    // individual instance nodes are rendered.
    expect(screen.queryByText("Dependents 2")).not.toBeInTheDocument();

    const groupButton = screen.getByRole("button", { name: /Dependents/ });
    await userEvent.click(groupButton);
    expect(onNavigate).toHaveBeenCalledWith("dependents");
  });

  it("expands a group into its numbered branch sub-nodes when the current step is inside it, keeping the group's own node as the current-blue anchor on the line", () => {
    const model: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      {
        kind: "group",
        id: "dependents",
        label: "Dependents",
        state: "current",
        instances: [
          { stepId: "dependents", label: "Dependents", state: "done" },
          { stepId: "dependents~1", label: "Dependents 2", state: "current" },
        ],
      },
    ];
    const { container } = render(
      <DesktopMap model={model} enteringIds={new Set()} onNavigate={vi.fn()} />,
    );

    // The group's own label appears twice: once as the current-blue anchor
    // on the main line, once as the (done) first instance in the branch.
    expect(screen.getAllByText("Dependents")).toHaveLength(2);
    expect(screen.getByText("Dependents 2")).toBeInTheDocument();

    const anchor = container.querySelector(
      ".step-progress-map__node-column > [aria-current='step']",
    );
    expect(anchor).toBeInTheDocument();
    // The anchor is the empty current node (no ordinal number inside it).
    expect(
      anchor?.querySelector(".step-progress-map__marker"),
    ).toHaveTextContent("");

    const currentInstance = screen
      .getByText("Dependents 2")
      .closest('[aria-current="step"]');
    expect(currentInstance).toBeInTheDocument();
    // Unlike the anchor, a current branch instance shows its own ordinal.
    expect(
      currentInstance?.querySelector(".step-progress-map__marker"),
    ).toHaveTextContent("2");

    // The branch hangs off the anchor's own column, not the main list.
    expect(
      container.querySelector(
        ".step-progress-map__node-column .step-progress-map__branch",
      ),
    ).toBeInTheDocument();
  });

  it("shows a locked node's ordinal as its 1-based position in the node list, with a repeatable group counting as one slot", () => {
    const model: ProgressModel = [
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
      { kind: "step", id: "income", label: "Income", state: "current" },
      { kind: "step", id: "documents", label: "Documents", state: "locked" },
    ];
    render(
      <DesktopMap model={model} enteringIds={new Set()} onNavigate={vi.fn()} />,
    );

    // "Documents" is the 3rd node — the group counted as a single slot.
    const locked = screen
      .getByText("Documents")
      .closest(".step-progress-map__node");
    expect(
      locked?.querySelector(".step-progress-map__marker"),
    ).toHaveTextContent("3");
  });

  it("shows a flag instead of an ordinal for the review-variant terminal node, and a check when it's done", () => {
    const lockedModel: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "current" },
      {
        kind: "step",
        id: "check-your-answers",
        label: "Review & submit",
        state: "locked",
        variant: "review",
      },
    ];
    const { rerender } = render(
      <DesktopMap
        model={lockedModel}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Review & submit").closest(".step-progress-map__node"),
    ).toHaveTextContent("🏁");

    const doneModel: ProgressModel = [
      { kind: "step", id: "a", label: "Step A", state: "done" },
      {
        kind: "step",
        id: "check-your-answers",
        label: "Review & submit",
        state: "done",
        variant: "review",
      },
    ];
    rerender(
      <DesktopMap
        model={doneModel}
        enteringIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Review & submit").closest(".step-progress-map__node"),
    ).toHaveTextContent("✓");
  });
});
