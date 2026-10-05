import { describe, expect, it } from "vitest";
import type {
  ClientFormStep,
  FormMeta,
  RepeatableStepSettings,
} from "@forms/types";

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
      repeatSettings: {},
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
      repeatSettings: {},
    });

    expect(sections[0].fields.map((f) => f.fieldId)).toEqual(["first-name"]);
  });

  it("leaves out a step the applicant skipped entirely", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: steps } as FormMeta,
      visibleFieldIdsByStep: { "about-you": ["first-name"] },
      values: { "about-you": { "first-name": "Addie" } },
      repeatSettings: {},
    });

    expect(sections.map((s) => s.stepId)).toEqual(["about-you"]);
  });
});

describe("buildPrintedAnswers — file answers", () => {
  const documentSteps = [
    {
      stepId: "documents",
      title: "Upload your documents",
      fields: [{ fieldId: "id-scan", label: "ID scan", htmlType: "file" }],
    },
  ] as unknown as ClientFormStep[];

  it("names an uploaded file rather than keeping its storage key", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: documentSteps } as FormMeta,
      visibleFieldIdsByStep: { documents: ["id-scan"] },
      values: {
        documents: {
          "id-scan": [
            {
              key: "uploads/abc123/passport.pdf",
              name: "passport.pdf",
              size: 1024,
              type: "application/pdf",
            },
          ],
        },
      },
      repeatSettings: {},
    });

    expect(sections[0].fields[0].value).toBe("passport.pdf");
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

// `orderedStepIds` mirrors what `setupRepeatSteps` records: the base step is
// the shared-values page (not an instance), so instance 1 is `~1`.
const repeatableRepeatSettings: RepeatableStepSettings = {
  "child-details": {
    minRepeats: 1,
    maxRepeats: 5,
    stepData: {},
    orderedStepIds: ["child-details", "child-details~1", "child-details~2"],
    sharedData: { "child-school": "", "child-principal-name": "" },
  },
};

describe("buildPrintedAnswers — repeatable steps", () => {
  it("prints each instance's own answers, not only the shared ones", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: repeatableSteps } as FormMeta,
      visibleFieldIdsByStep: repeatableVisibleFieldIds,
      values: repeatableValues,
      repeatSettings: repeatableRepeatSettings,
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
      repeatSettings: repeatableRepeatSettings,
    });

    expect(sections[0].fields.map((f) => f.fieldId)).not.toContain("child-dob");
  });

  // The values object still carries every instance's date of birth — only the
  // per-instance VISIBLE set differs. Without pruning each instance to its own
  // visible ids first, the union `foldRepeatInstances` builds from every
  // instance (instance 1 showed `child-dob`) would let it print for instance 2
  // as well, even though instance 2's own branch hid it.
  it("keeps a question hidden on one instance off THAT instance's printed answers, even though another instance showed it", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: repeatableSteps } as FormMeta,
      visibleFieldIdsByStep: {
        ...repeatableVisibleFieldIds,
        "child-details~2": ["child-first-name"], // instance 2 hid child-dob
      },
      values: repeatableValues,
      repeatSettings: repeatableRepeatSettings,
    });

    expect(sections[0].fields.map((f) => f.fieldId)).toContain("child-dob");
    expect(sections[1].fields.map((f) => f.fieldId)).not.toContain("child-dob");
  });
});

// An ordinary (non-shared) repeatable has no separate shared-values page — the
// base step IS instance 1, and `~1`, `~2`, … are the later instances.
const ordinaryRepeatableSteps = [
  {
    stepId: "kids",
    title: "Tell us about the child",
    fields: [
      {
        fieldId: "has-allergy",
        label: "Does the child have an allergy?",
        htmlType: "text",
      },
      { fieldId: "allergy", label: "Which allergy", htmlType: "text" },
    ],
  },
] as unknown as ClientFormStep[];

const ordinaryRepeatableValues = {
  kids: [
    { "has-allergy": "yes", allergy: "Peanuts" },
    // Started typing an answer, then switched to "no" — the branch hides
    // `allergy` for this instance, but the value it briefly held is still in
    // the submitted values (formatDataForSubmission prunes hidden fields from
    // the flat values, never from a repeat instance's own stepData).
    { "has-allergy": "no", allergy: "Shellfish" },
  ],
};

const ordinaryRepeatSettings: RepeatableStepSettings = {
  kids: {
    minRepeats: 1,
    maxRepeats: 5,
    stepData: {},
    orderedStepIds: ["kids", "kids~1"],
  },
};

describe("buildPrintedAnswers — ordinary (non-shared) repeatable steps", () => {
  it("keeps a question hidden on one instance off that instance's printed answers", () => {
    const sections = buildPrintedAnswers({
      formMeta: { contractSteps: ordinaryRepeatableSteps } as FormMeta,
      visibleFieldIdsByStep: {
        kids: ["has-allergy", "allergy"],
        "kids~1": ["has-allergy"],
      },
      values: ordinaryRepeatableValues,
      repeatSettings: ordinaryRepeatSettings,
    });

    expect(sections[0].fields.map((f) => f.fieldId)).toContain("allergy");
    expect(sections[1].fields.map((f) => f.fieldId)).not.toContain("allergy");
  });
});
