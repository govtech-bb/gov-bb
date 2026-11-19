import {
  content,
  defineFormRegistry,
  defineFormRegistryEntry,
  option,
  question,
  rule,
} from "../../src/forms";

export const applicantEntry = defineFormRegistryEntry({
  scope: "fragment",
  key: "example/applicant",
  version: 1,
  title: "Applicant details",
  description: "A copied applicant section with local references and visible logic.",
  blocks: [
    question({ id: "applicant", key: "applicant", kind: "text", label: "Applicant name" }),
    question({
      id: "consent",
      key: "consent",
      kind: "choice",
      label: "Include a reference?",
      config: { selection: "single", presentation: "radio" },
      options: [
        option({ id: "yes", label: "Yes", value: "approved" }),
        option({ id: "no", label: "No", value: "declined" }),
      ],
    }),
    question({
      id: "reference",
      key: "reference",
      kind: "reference-code",
      label: "Application reference",
      visible: false,
      config: {
        code: "APP",
        peer: "applicant",
        opaque: { literal: "applicant", token: "{{applicant}}" },
      },
    }),
    content({
      id: "notice",
      kind: "example-notice",
      content: "Applicant information",
      config: { tone: "information", peer: "applicant", literal: "applicant" },
    }),
    rule({
      id: "applicant-rule",
      rules: [
        {
          id: "show-reference",
          when: { op: "selected", question: "consent", option: "yes" },
          actions: [
            { type: "setVisible", targets: ["reference"], value: true },
            { type: "setLabel", target: "reference", value: "Your application reference" },
            { type: "setVisible", targets: ["notice"], value: false },
          ],
        },
      ],
    }),
  ],
});

export const applicantRegistry = defineFormRegistry([applicantEntry]);
