import { describe, expect, it } from "vitest";
import type { ClientFormStep } from "@forms/types";
import { buildPrintedAnswers } from "./printed-answers";

const steps = [
  {
    stepId: "about-you",
    title: "Tell us about yourself",
    fields: [
      { fieldId: "first-name", label: "First name", htmlType: "text" },
      { fieldId: "dob", label: "Date of birth", htmlType: "date" },
    ],
  },
  {
    stepId: "your-work",
    title: "Tell us where you plan to work",
    fields: [
      {
        fieldId: "where",
        label: "Where do you plan to work?",
        htmlType: "radio",
        options: [
          { label: "At a funeral establishment", value: "establishment" },
          { label: "Somewhere else", value: "other" },
        ],
      },
    ],
  },
] as unknown as ClientFormStep[];

describe("buildPrintedAnswers", () => {
  it("renders the answers the same way the MDA email does", () => {
    const sections = buildPrintedAnswers({
      steps,
      visibleFieldIdsByStep: {
        "about-you": ["first-name", "dob"],
        "your-work": ["where"],
      },
      values: {
        "about-you": {
          "first-name": "Addie",
          dob: { day: "5", month: "6", year: "1994" },
        },
        "your-work": { where: "establishment" },
      },
    });

    expect(sections).toEqual([
      {
        stepId: "about-you",
        title: "Tell us about yourself",
        fields: [
          { fieldId: "first-name", label: "First name", value: "Addie" },
          { fieldId: "dob", label: "Date of birth", value: "5 June 1994" },
        ],
      },
      {
        stepId: "your-work",
        title: "Tell us where you plan to work",
        fields: [
          {
            fieldId: "where",
            label: "Where do you plan to work?",
            value: "At a funeral establishment",
          },
        ],
      },
    ]);
  });

  it("leaves out a question the branch never showed the applicant", () => {
    const sections = buildPrintedAnswers({
      steps,
      visibleFieldIdsByStep: {
        "about-you": ["first-name"],
        "your-work": ["where"],
      },
      values: {
        "about-you": {
          "first-name": "Addie",
          dob: { day: "5", month: "6", year: "1994" },
        },
        "your-work": { where: "establishment" },
      },
    });

    expect(sections[0].fields.map((f) => f.fieldId)).toEqual(["first-name"]);
  });

  it("leaves out a step the applicant skipped entirely", () => {
    const sections = buildPrintedAnswers({
      steps,
      visibleFieldIdsByStep: { "about-you": ["first-name"] },
      values: { "about-you": { "first-name": "Addie" } },
    });

    expect(sections.map((s) => s.stepId)).toEqual(["about-you"]);
  });
});
