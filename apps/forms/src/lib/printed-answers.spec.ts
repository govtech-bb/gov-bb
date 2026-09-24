import { describe, expect, it } from "vitest";
import type { ClientFormStep, FormMeta } from "@forms/types";
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
      formMeta: { contractSteps: steps } as FormMeta,
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
      formMeta: { contractSteps: steps } as FormMeta,
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
      formMeta: { contractSteps: steps } as FormMeta,
      visibleFieldIdsByStep: { "about-you": ["first-name"] },
      values: { "about-you": { "first-name": "Addie" } },
    });

    expect(sections.map((s) => s.stepId)).toEqual(["about-you"]);
  });
});

// A `sharedFields` repeatable is the one shape where the rendered steps and
// the contract disagree: the renderer splits `child-details` into a shared
// page (school, principal) and one `~N` page per child (name, date of birth),
// while the submitted values collapse back into one array of whole children.
// The printed copy has to read like the contract — and like the MDA email —
// not like the split.
const repeatableSteps = [
  {
    stepId: "child-details",
    title: "Tell us about the child",
    fields: [
      { fieldId: "child-first-name", label: "First name", htmlType: "text" },
      { fieldId: "child-dob", label: "Date of birth", htmlType: "date" },
      { fieldId: "child-school", label: "School", htmlType: "text" },
      { fieldId: "child-principal-name", label: "Principal", htmlType: "text" },
    ],
  },
] as unknown as ClientFormStep[];

const repeatableValues = {
  "child-details": [
    {
      "child-first-name": "Ada",
      "child-dob": { day: "5", month: "6", year: "2015" },
      "child-school": "St Giles",
      "child-principal-name": "Ms Blackman",
    },
    {
      "child-first-name": "Blaise",
      "child-dob": { day: "2", month: "9", year: "2017" },
      "child-school": "St Giles",
      "child-principal-name": "Ms Blackman",
    },
  ],
};

const repeatableVisibleFieldIds = {
  "child-details": ["child-school", "child-principal-name"],
  "child-details~1": ["child-first-name", "child-dob"],
  "child-details~2": ["child-first-name", "child-dob"],
};

describe("buildPrintedAnswers — repeatable steps", () => {
  it("prints each instance's own answers, not only the shared ones", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: repeatableSteps } as FormMeta,
      visibleFieldIdsByStep: repeatableVisibleFieldIds,
      values: repeatableValues,
    });

    expect(sections.map((s) => s.title)).toEqual([
      "Tell us about the child (1)",
      "Tell us about the child (2)",
    ]);
    expect(sections[0].fields).toEqual([
      { fieldId: "child-first-name", label: "First name", value: "Ada" },
      { fieldId: "child-dob", label: "Date of birth", value: "5 June 2015" },
      { fieldId: "child-school", label: "School", value: "St Giles" },
      {
        fieldId: "child-principal-name",
        label: "Principal",
        value: "Ms Blackman",
      },
    ]);
    expect(sections[1].fields[0].value).toBe("Blaise");
  });

  it("keeps a question hidden in every instance off the printed copy", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: repeatableSteps } as FormMeta,
      visibleFieldIdsByStep: {
        ...repeatableVisibleFieldIds,
        "child-details~1": ["child-first-name"],
        "child-details~2": ["child-first-name"],
      },
      values: repeatableValues,
    });

    expect(sections[0].fields.map((f) => f.fieldId)).not.toContain("child-dob");
  });
});
