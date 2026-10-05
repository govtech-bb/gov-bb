import { defineFormRegistryEntry } from "../../forms/registry/definition";
import { content, question, option, rule } from "../../forms/registry/builders";
import type { AnyFormDefinition, QuestionBase } from "../../forms/schema";
import { componentQuestion } from "./questions";

const required = { value: true, message: "Enter an answer" };

const field = (
  id: string,
  kind: string,
  label: string,
  extra: Partial<QuestionBase> = {},
): QuestionBase => question({ id, key: id, kind, label, required, ...extra });

/** The fresh draft and complete-form registry entry share this native definition. */
export const demoForm: AnyFormDefinition = {
  schemaVersion: 2,
  id: "loud-music-permit",
  title: "Apply for a permit to play loud music",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  description: "Apply for a permit to play amplified music at an event.",
  settings: {
    visibility: "draft",
    hiddenAnswers: "retain",
    contact: {
      title: "Permits Office",
      telephoneNumber: "+1 (246) 555-0100",
      email: "permits@example.gov.bb",
    },
  },
  blocks: [
    {
      id: "event",
      type: "page",
      role: "questions",
      title: "Tell us about the event",
      description:
        "We use this to check that amplified music is allowed where and when you plan it.",
    },
    content({
      id: "intro",
      kind: "paragraph",
      content: "Use this form to apply for a permit for an event with amplified music.",
    }),
    content({ id: "need", kind: "paragraph", content: "You will need:" }),
    content({
      id: "need-list",
      kind: "list",
      content: "",
      config: {
        ordered: false,
        items: [
          { id: "date-address", content: "the date and address of the event" },
          { id: "site-plan", content: "a site plan if you need to close a road" },
        ],
      },
    }),
    field("event-name", "text", "Event name"),
    field("event-parish", "choice", "Which parish is the event in?", {
      config: { selection: "single", presentation: "dropdown" },
      options: [
        option({ id: "christ-church", label: "Christ Church", value: "Christ Church" }),
        option({ id: "saint-michael", label: "Saint Michael", value: "Saint Michael" }),
      ],
    }),
    field("event-date", "date", "Event date", {
      hint: "For example, 27 3 2026",
      validation: [
        {
          id: "future-or-today",
          type: "dateAfter",
          value: { context: "today" },
          inclusive: true,
          message: "Enter today or a future date",
        },
      ],
    }),
    componentQuestion("components/national-id-number", "national-id-number"),
    content({
      id: "passport-help",
      kind: "expandable",
      content: "Use passport number instead",
      config: {
        blocks: [
          content({
            id: "passport-intro",
            kind: "paragraph",
            content:
              "If you don’t have a National ID number, you can use your passport number instead.",
          }),
        ],
      },
    }),
    componentQuestion("components/passport-number", "passport-number", {
      layout: { under: { block: "passport-help" } },
    }),
    { id: "road-closure", type: "page", role: "questions", title: "Road closure" },
    field("close-road", "choice", "Do you need to close a road?", {
      config: { selection: "single", presentation: "radio" },
      options: [
        option({ id: "yes", label: "Yes", value: "Yes" }),
        option({ id: "no", label: "No", value: "No" }),
      ],
    }),
    field("closure-duration", "text", "How long will the road be closed?", {
      visible: false,
      layout: { under: { question: "close-road", option: "yes" } },
    }),
    content({
      id: "closure-warning",
      kind: "callout",
      content: "Apply at least 14 days before the event if you need to close a road.",
      config: { tone: "warning" },
      visible: false,
      layout: { under: { question: "close-road", option: "yes" } },
    }),
    rule({
      id: "closure-follow-up",
      rules: [
        {
          id: "show-closure",
          when: { op: "selected", question: "close-road", option: "yes" },
          actions: [
            { type: "setVisible", targets: ["closure-duration", "closure-warning"], value: true },
          ],
        },
      ],
    }),
    field("roads", "long-text", "Which roads?", {
      required: { value: false, message: "Enter the roads" },
    }),
    field("site-plan", "file", "Upload a site plan"),
    {
      id: "sound-systems",
      type: "page",
      role: "questions",
      title: "Sound systems",
      repeat: {
        key: "sound-systems",
        min: 1,
        max: 5,
        itemLabel: "Sound system",
        addLabel: "Add another sound system",
      },
    },
    field("sound-type", "text", "Type of sound system"),
    field("speakers", "number", "Number of speakers"),
    field("speaker-brand", "text", "Speaker brand", {
      repeat: { min: 1, max: 4, addLabel: "Add another speaker brand" },
    }),
    {
      id: "review",
      type: "page",
      role: "review",
      title: "Check your answers",
      review: { questions: "preceding", emptyAnswers: "omit", changeLinks: true },
    },
    { id: "declaration", type: "page", role: "declaration", title: "Declaration" },
    field("declaration-confirmation", "choice", "Declaration", {
      config: { selection: "multiple", presentation: "checkboxes" },
      required: { value: true, message: "You must confirm the declaration to continue" },
      options: [
        option({
          id: "confirm",
          label: "I confirm the information I have given is correct",
          value: "confirmed",
        }),
      ],
    }),
    { id: "confirmation", type: "page", role: "confirmation", title: "Application sent" },
    content({ id: "sent-title", kind: "question-label", content: "Application sent" }),
    content({
      id: "sent-message",
      kind: "paragraph",
      content: "We will email you within 5 working days.",
    }),
    content({
      id: "next-title",
      kind: "heading",
      content: "What happens next",
      config: { level: 2 },
    }),
    content({
      id: "next-steps",
      kind: "list",
      content: "",
      config: {
        ordered: true,
        items: [
          { id: "check", content: "We check your application." },
          { id: "call", content: "We may call you to ask about the event." },
          { id: "email", content: "We email you your permit." },
        ],
      },
    }),
  ],
};

export const demoFormEntry = defineFormRegistryEntry({
  scope: "form",
  key: "GOVBB_LOUD_MUSIC_PERMIT",
  version: 1,
  title: "Loud music permit",
  description:
    "A complete example application with event details, road closure, repeating sound systems, review and declaration.",
  form: demoForm,
});
