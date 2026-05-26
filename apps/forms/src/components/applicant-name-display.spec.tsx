/**
 * applicant-name-display.spec.tsx
 *
 * Covers:
 * - Returns null when both firstName and lastName are undefined
 * - Returns null when both are empty strings (falsy)
 * - Renders the data-applicant-name div when firstName is set
 * - Displays full name (firstName + " " + lastName)
 * - Displays firstName only when lastName is absent
 * - Displays the current date using toLocaleDateString()
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { useStore } from "@tanstack/react-form";
import ApplicantNameDisplay from "./applicant-name-display";

jest.mock("@tanstack/react-form", () => ({
  useStore: jest.fn(),
}));

const mockUseStore = useStore as jest.Mock;

const mockForm = { store: {} };

describe("ApplicantNameDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when both firstName and lastName are undefined", () => {
    mockUseStore.mockReturnValue({});
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when both firstName and lastName are empty strings", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "",
      "applicant-details_applicant-last-name": "",
    });
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders data-applicant-name div when firstName is set", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "Alice",
    });
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    expect(container.querySelector("[data-applicant-name]")).toBeTruthy();
  });

  it("displays full name when both firstName and lastName are provided", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "Alice",
      "applicant-details_applicant-last-name": "Smith",
    });
    render(<ApplicantNameDisplay form={mockForm} />);
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
  });

  it("displays firstName only (and no trailing lastName) when lastName is absent", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "Alice",
    });
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    // Inspect the actual rendered text directly rather than a /Alice/ regex
    // that would also match "Alice Smith". The Applicant paragraph must end
    // with the first name and contain no second word that could leak from
    // a stale lastName.
    const applicantP = container.querySelector(
      "[data-applicant-name] p:first-of-type",
    );
    expect(applicantP?.textContent).toMatch(/Applicant:\s+Alice\s*$/);
  });

  it("displays the current date using toLocaleDateString", () => {
    // Pin the clock so the date computed inside the component matches the
    // one computed in the test — otherwise the test is flaky at midnight.
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    try {
      mockUseStore.mockReturnValue({
        "applicant-details_applicant-first-name": "Alice",
      });
      render(<ApplicantNameDisplay form={mockForm} />);
      const expectedDate = new Date().toLocaleDateString();
      expect(
        screen.getByText(
          new RegExp(expectedDate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        ),
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
