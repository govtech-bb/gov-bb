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

  it("expands a group into its numbered branch sub-nodes when the current step is inside it", () => {
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
    render(
      <DesktopMap model={model} enteringIds={new Set()} onNavigate={vi.fn()} />,
    );

    expect(screen.getByText("Dependents")).toBeInTheDocument();
    expect(screen.getByText("Dependents 2")).toBeInTheDocument();
    expect(
      screen.getByText("Dependents 2").closest('[aria-current="step"]'),
    ).toBeInTheDocument();
  });
});
