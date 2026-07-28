import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderContentElement } from "./content-field";
import type { ClientPrimitive } from "@forms/types";

const base = {
  id: "s_n",
  fieldId: "n",
  stepId: "s",
  name: "n",
  label: "Information",
  htmlType: "content",
  disabled: false,
  hidden: false,
  conditionallyHidden: false,
} as unknown as ClientPrimitive;

describe("renderContentElement", () => {
  // react-markdown is mocked with a passthrough renderer (see
  // test/__mocks__/react-markdown.tsx), so this asserts the inset wraps its
  // content and wires it through markdown, rather than the rendered bold
  // itself — same convention as field-renderer.spec.tsx's checkbox-label test.
  it("renders inset content wrapped in the inset class, wired through markdown", () => {
    render(
      renderContentElement({
        ...base,
        variant: "inset",
        content: "You **do not need** a form.",
      }),
    );
    const inset = document.querySelector(".govbb-inset-text");
    expect(inset).not.toBeNull();
    const md = inset?.querySelector('[data-testid="react-markdown"]');
    expect(md?.textContent).toBe("You **do not need** a form.");
  });

  it("renders a details disclosure with summary + body", () => {
    render(
      renderContentElement({
        ...base,
        variant: "details",
        summary: "Why you do not choose officer times",
        content: "The Environmental Health Department assigns officers.",
      }),
    );
    expect(
      screen.getByText("Why you do not choose officer times").tagName,
    ).toBe("SUMMARY");
    expect(
      screen.getByText(/Environmental Health Department assigns/),
    ).not.toBeNull();
  });

  it("renders plain text variant", () => {
    render(
      renderContentElement({ ...base, variant: "text", content: "Plain." }),
    );
    expect(document.querySelector(".govbb-content-text")).not.toBeNull();
  });
});
