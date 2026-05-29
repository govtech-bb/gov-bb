/**
 * applicant-name-display.spec.tsx
 *
 * Covers:
 * - Returns null when both firstName and lastName are undefined
 * - Returns null when both are empty strings (falsy)
 * - Renders the applicant block when firstName is set
 * - Displays full name (first + middle + last), middle omitted when absent
 * - Resolves the `applicant-details` naming (applicant-first-name, …)
 * - Resolves the camelCase naming (firstName, otherNames, lastName)
 * - Displays the current date formatted DD/MM/YYYY
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

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  it("renders the applicant name block when firstName is set", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "Alice",
    });
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    expect(container.querySelector(".form-page__applicant")).toBeTruthy();
  });

  it("displays full name when both firstName and lastName are provided (applicant-details naming)", () => {
    mockUseStore.mockReturnValue({
      "applicant-details_applicant-first-name": "Alice",
      "applicant-details_applicant-last-name": "Smith",
    });
    render(<ApplicantNameDisplay form={mockForm} />);
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
  });

  it("resolves camelCase name fields and includes the middle/other name", () => {
    // Temp-teacher form: personal-data_firstName / otherNames / lastName.
    mockUseStore.mockReturnValue({
      "personal-data_firstName": "Jane",
      "personal-data_otherNames": "Marie",
      "personal-data_lastName": "Doe",
    });
    render(<ApplicantNameDisplay form={mockForm} />);
    expect(screen.getByText(/Jane Marie Doe/)).toBeInTheDocument();
  });

  it("omits the middle name when absent", () => {
    mockUseStore.mockReturnValue({
      "personal-data_firstName": "Jane",
      "personal-data_lastName": "Doe",
    });
    const { container } = render(<ApplicantNameDisplay form={mockForm} />);
    const applicantP = container.querySelector(
      ".form-page__applicant p:first-of-type",
    );
    expect(applicantP?.textContent).toMatch(/Applicant's name:\s+Jane Doe\s*$/);
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
      ".form-page__applicant p:first-of-type",
    );
    expect(applicantP?.textContent).toMatch(/Applicant's name:\s+Alice\s*$/);
  });

  it("displays the current date formatted DD/MM/YYYY", () => {
    // Pin the clock so the date computed inside the component matches the
    // one computed in the test — otherwise the test is flaky at midnight.
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    try {
      mockUseStore.mockReturnValue({
        "applicant-details_applicant-first-name": "Alice",
      });
      const { container } = render(<ApplicantNameDisplay form={mockForm} />);
      const dateP = container.querySelector(
        ".form-page__applicant p:last-of-type",
      );
      // Compute the expected date with the same local-date methods the
      // component uses, so the assertion is timezone-robust (the component
      // formats DD/MM/YYYY from the local date, not UTC).
      const now = new Date();
      const expected = [
        String(now.getDate()).padStart(2, "0"),
        String(now.getMonth() + 1).padStart(2, "0"),
        now.getFullYear(),
      ].join("/");
      expect(dateP?.textContent).toMatch(
        new RegExp(`Date:\\s+${escapeRegExp(expected)}\\s*$`),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
