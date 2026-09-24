import { describe, expect, it } from "vitest";
import type { FormStep } from "@govtech-bb/form-types";
import {
  buildSubmissionSections,
  summaryValueToText,
  type SubmissionVisibility,
} from "./index";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const personalStep = {
  stepId: "personal",
  title: "Personal Information",
  elements: [
    { fieldId: "firstName", label: "First Name", htmlType: "text" },
    {
      fieldId: "gender",
      label: "Gender",
      htmlType: "radio",
      options: [
        { label: "Male", value: "male" },
        { label: "Female", value: "female" },
      ],
    },
  ],
} as unknown as FormStep;

/** Everything visible: no per-step entry in activeFieldIds means "show all". */
function visibility(
  overrides: Partial<SubmissionVisibility> = {},
): SubmissionVisibility {
  return {
    activeStepIds: ["personal"],
    hiddenStepIds: [],
    activeFieldIds: {},
    hiddenFieldIds: {},
    ...overrides,
  };
}

function build(
  steps: FormStep[],
  values: Record<string, unknown>,
  vis: SubmissionVisibility = visibility(),
) {
  return buildSubmissionSections({
    contract: { steps },
    values: values as never,
    visibility: vis,
  });
}

/* ── tests ────────────────────────────────────────────────────────────────── */

describe("buildSubmissionSections", () => {
  it("carries the step id and title, and each field's id and contract label", () => {
    const sections = build([personalStep], {
      personal: { firstName: "Addie" },
    });

    expect(sections).toEqual([
      {
        stepId: "personal",
        title: "Personal Information",
        fields: [{ fieldId: "firstName", label: "First Name", value: "Addie" }],
      },
    ]);
  });

  it("resolves an option slug to its label", () => {
    const [section] = build([personalStep], {
      personal: { gender: "female" },
    });

    expect(section.fields).toEqual([
      { fieldId: "gender", label: "Gender", value: "Female" },
    ]);
  });

  it("joins multi-select option labels with a comma", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [
        {
          fieldId: "interests",
          label: "Interests",
          htmlType: "checkbox",
          options: [
            { label: "Sports", value: "sports" },
            { label: "Music", value: "music" },
          ],
        },
      ],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { interests: ["sports", "music"] },
    });

    expect(section.fields[0].value).toBe("Sports, Music");
  });

  it("formats a complete date value as a readable date", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [{ fieldId: "dob", label: "Date of birth", htmlType: "date" }],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { dob: { day: "5", month: "6", year: "2026" } },
    });

    expect(section.fields[0].value).toBe("5 June 2026");
  });

  it("passes a legacy ISO date string through unchanged", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [{ fieldId: "dob", label: "Date of birth", htmlType: "date" }],
    } as unknown as FormStep;

    const [section] = build([step], { personal: { dob: "2026-06-05" } });

    expect(section.fields[0].value).toBe("2026-06-05");
  });

  it("leaves a file answer as its raw node array rather than a filename string", () => {
    const step = {
      stepId: "docs",
      title: "Documents",
      elements: [
        {
          fieldId: "medicalCert",
          label: "Medical certificate",
          htmlType: "file",
        },
      ],
    } as unknown as FormStep;

    const [section] = build(
      [step],
      {
        docs: {
          medicalCert: [
            {
              key: "uploads/abc",
              name: "cert.pdf",
              size: 120,
              type: "application/pdf",
            },
          ],
        },
      },
      visibility({ activeStepIds: ["docs"] }),
    );

    expect(section.fields[0].value).toEqual([
      {
        key: "uploads/abc",
        name: "cert.pdf",
        size: 120,
        type: "application/pdf",
      },
    ]);
  });

  it("drops file items that were never durably uploaded", () => {
    const step = {
      stepId: "docs",
      title: "Documents",
      elements: [
        {
          fieldId: "medicalCert",
          label: "Medical certificate",
          htmlType: "file",
        },
      ],
    } as unknown as FormStep;

    const sections = build(
      [step],
      { docs: { medicalCert: [{ name: "pending.pdf" }] } },
      visibility({ activeStepIds: ["docs"] }),
    );

    expect(sections).toEqual([]);
  });

  it("joins a multi-value non-option answer with a comma and a space", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [{ fieldId: "aliases", label: "Aliases", htmlType: "text" }],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { aliases: ["Ada", "Addie"] },
    });

    expect(section.fields[0].value).toBe("Ada, Addie");
  });

  it("omits a step that is not active", () => {
    const sections = build(
      [personalStep],
      { personal: { firstName: "Addie" } },
      visibility({ activeStepIds: [] }),
    );

    expect(sections).toEqual([]);
  });

  it("omits a step listed as hidden", () => {
    const sections = build(
      [personalStep],
      { personal: { firstName: "Addie" } },
      visibility({ hiddenStepIds: ["personal"] }),
    );

    expect(sections).toEqual([]);
  });

  it("omits a field that the audit trail does not list as active", () => {
    const [section] = build(
      [personalStep],
      { personal: { firstName: "Addie", gender: "female" } },
      visibility({ activeFieldIds: { personal: ["firstName"] } }),
    );

    expect(section.fields.map((f) => f.fieldId)).toEqual(["firstName"]);
  });

  it("omits a field listed as hidden", () => {
    const [section] = build(
      [personalStep],
      { personal: { firstName: "Addie", gender: "female" } },
      visibility({ hiddenFieldIds: { personal: ["gender"] } }),
    );

    expect(section.fields.map((f) => f.fieldId)).toEqual(["firstName"]);
  });

  it("flattens per-instance visibility arrays from a repeatable audit trail", () => {
    const [section] = build(
      [personalStep],
      { personal: { firstName: "Addie", gender: "female" } },
      visibility({ activeFieldIds: { personal: [["firstName"], ["gender"]] } }),
    );

    expect(section.fields.map((f) => f.fieldId)).toEqual([
      "firstName",
      "gender",
    ]);
  });

  it("skips presentational elements that hold no answer", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [
        { fieldId: "guidance", label: "Read this", htmlType: "content" },
        { fieldId: "reveal", label: "More detail", htmlType: "show-hide" },
        { fieldId: "firstName", label: "First Name", htmlType: "text" },
      ],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { guidance: "x", reveal: "y", firstName: "Addie" },
    });

    expect(section.fields.map((f) => f.fieldId)).toEqual(["firstName"]);
  });

  it("skips machine-written fields the applicant never saw", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [
        { fieldId: "firstName", label: "First Name", htmlType: "text" },
        {
          fieldId: "coords",
          label: "Address coordinates",
          htmlType: "text",
          ui: { hidden: true },
        },
      ],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { firstName: "Addie", coords: "13.09,-59.57" },
    });

    expect(section.fields.map((f) => f.fieldId)).toEqual(["firstName"]);
  });

  it("drops an unanswered field and a section left with no answers", () => {
    const sections = build([personalStep], {
      personal: { firstName: "", gender: null },
    });

    expect(sections).toEqual([]);
  });

  it("honours a per-answer step title override", () => {
    const step = {
      stepId: "personal",
      title: "Their details",
      conditionalTitle: [
        {
          targetStepId: "personal",
          targetFieldId: "applyingFor",
          operator: "equal",
          value: "self",
          title: "Your details",
        },
      ],
      elements: [
        { fieldId: "applyingFor", label: "Applying for", htmlType: "text" },
      ],
    } as unknown as FormStep;

    const [section] = build([step], { personal: { applyingFor: "self" } });

    expect(section.title).toBe("Your details");
  });

  it("honours a per-answer field label override", () => {
    const step = {
      stepId: "personal",
      title: "Personal Information",
      elements: [
        { fieldId: "permitFor", label: "Applying for", htmlType: "text" },
        {
          fieldId: "name",
          label: "Name of location",
          conditionalLabel: [
            {
              targetStepId: "personal",
              targetFieldId: "permitFor",
              operator: "equal",
              value: "event",
              label: "Name of event",
            },
          ],
          htmlType: "text",
        },
      ],
    } as unknown as FormStep;

    const [section] = build([step], {
      personal: { permitFor: "event", name: "Crop Over" },
    });

    expect(section.fields[1].label).toBe("Name of event");
  });

  it("numbers the sections of a repeatable step with more than one instance", () => {
    const sections = build([personalStep], {
      personal: [{ firstName: "Addie" }, { firstName: "Ada" }],
    });

    expect(sections.map((s) => s.title)).toEqual([
      "Personal Information (1)",
      "Personal Information (2)",
    ]);
    expect(sections.map((s) => s.stepId)).toEqual(["personal", "personal"]);
  });

  it("leaves a single-instance repeatable step title unnumbered", () => {
    const sections = build([personalStep], {
      personal: [{ firstName: "Addie" }],
    });

    expect(sections.map((s) => s.title)).toEqual(["Personal Information"]);
  });
});

// The email and the printed confirmation both show a file as its name; only
// the CMS renders the nodes themselves. One implementation, so the two text
// surfaces cannot drift.
describe("summaryValueToText", () => {
  it("passes an already-formatted answer through", () => {
    expect(summaryValueToText("5 June 2026")).toBe("5 June 2026");
  });

  it("names uploaded files, comma separated", () => {
    expect(
      summaryValueToText([
        { key: "uploads/a", name: "cert.pdf" },
        { key: "uploads/b", name: "photo.jpeg" },
      ]),
    ).toBe("cert.pdf, photo.jpeg");
  });

  it("falls back to the key's basename for a file with no name", () => {
    expect(summaryValueToText([{ key: "uploads/2026/scan-1.pdf" }])).toBe(
      "scan-1.pdf",
    );
  });
});
