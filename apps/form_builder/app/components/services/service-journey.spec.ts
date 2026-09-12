import {
  serviceSnapshotSchema,
  serviceReadiness,
} from "@govtech-bb/form-types";
import { serviceJourney, addJourneyLink, journeyMap } from "./service-journey";
import { appendServicePage, EMPTY_PAGE } from "../../lib/content";
vi.mock("../../server/registry", () => ({ getCatalogFn: vi.fn() }));

function snapshot() {
  return serviceSnapshotSchema.parse({
    manifest: {
      schemaVersion: 1,
      visibility: "public",
      serviceId: "test-service",
      title: "Test service",
      formId: "test-service",
      category: "health",
      entryPoint: "form",
      pages: [],
      contactDetails: { email: "help@example.test" },
      setup: { step: "check", delivery: "none", applicantEmail: "none" },
    },
    pages: [],
    pendingConfig: { mdaContactId: null, processors: null },
    recipe: {
      formId: "test-service",
      title: "Test service",
      steps: [
        {
          stepId: "first",
          title: "First page",
          elements: [{ ref: "components/first-name" }],
        },
        {
          stepId: "conditional",
          title: "Optional details",
          elements: [],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetStepId: "first",
              targetFieldId: "answer",
              value: "yes",
              operator: "equal",
            },
          ],
        },
        {
          stepId: "another",
          title: "More details",
          elements: [],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetStepId: "first",
              targetFieldId: "answer",
              value: "yes",
              operator: "equal",
            },
            { type: "repeatable", min: 1, max: 3 },
          ],
        },
        {
          stepId: "submission-confirmation",
          title: "Confirmation",
          elements: [],
        },
      ],
    },
  });
}

describe("Connected service journey", () => {
  it("renders decisions with Yes and No routes through consecutive conditional pages", () => {
    const original = snapshot();
    const before = JSON.stringify(original);
    const { nodes, edges } = serviceJourney(original, true, {
      "first.answer": "Do you need help?",
    });
    expect(
      nodes.find((node) => node.id === "condition:conditional"),
    ).toMatchObject({
      kind: "condition",
      stepId: "conditional",
      conditions: [
        { question: "Do you need help?", comparison: "is", answer: "yes" },
      ],
    });
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "step:first",
          to: "condition:conditional",
        }),
        expect.objectContaining({
          from: "condition:conditional",
          to: "step:conditional",
          branch: "yes",
        }),
        expect.objectContaining({
          from: "condition:conditional",
          to: "condition:another",
          branch: "no",
        }),
        expect.objectContaining({
          from: "step:conditional",
          to: "condition:another",
        }),
        expect.objectContaining({
          from: "condition:another",
          to: "step:submission-confirmation",
          branch: "no",
        }),
        expect.objectContaining({
          from: "step:another",
          to: "step:another",
          label: "Add another response",
        }),
      ]),
    );
    expect(
      edges.some(
        (edge) =>
          edge.from === "step:first" &&
          edge.to === "step:submission-confirmation",
      ),
    ).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("preserves stacked checks, date transforms, choice labels, and existence checks", () => {
    const draft = snapshot();
    draft.recipe!.steps[1].behaviours = [
      {
        type: "stepConditionalOn",
        targetStepId: "first",
        targetFieldId: "answer",
        operator: "in",
        value: ["yes", "maybe"],
      },
      {
        type: "stepConditionalOn",
        targetStepId: "first",
        targetFieldId: "dob",
        operator: "gte",
        transform: "yearsSince",
        value: 18,
      },
      {
        type: "stepConditionalOn",
        targetStepId: "first",
        targetFieldId: "email",
        operator: "exists",
        value: "ignored",
      },
    ];
    const { nodes, edges } = serviceJourney(
      draft,
      true,
      {
        "first.answer": "Do you need help?",
        "first.dob": "Date of birth",
        "first.email": "Email address",
      },
      {
        "first.answer": {
          options: [
            { value: "yes", label: "Yes please" },
            { value: "maybe", label: "Not sure" },
          ],
        },
      },
    );
    expect(
      nodes.find((node) => node.id === "condition:conditional")?.conditions,
    ).toEqual([
      {
        question: "Do you need help?",
        comparison: "includes any of",
        answer: "Yes please or Not sure",
      },
      {
        question: "Years since Date of birth",
        comparison: "is at least",
        answer: "18",
      },
      {
        question: "Email address",
        comparison: "has an answer",
        answer: undefined,
      },
    ]);
    expect(
      edges.filter((edge) => edge.from === "condition:conditional"),
    ).toHaveLength(2);
    draft.recipe!.steps = draft.recipe!.steps.slice(0, 2);
    const last = serviceJourney(draft, true);
    expect(last.nodes.some((node) => node.id === "form:end")).toBe(true);
    expect(last.edges).toContainEqual(
      expect.objectContaining({
        from: "condition:conditional",
        to: "form:end",
        branch: "no",
      }),
    );
  });
  it("adds a separate guidance page and link without replacing the main page", () => {
    const original = appendServicePage(
      snapshot(),
      "apps/landing/src/content/test-service/index.md",
      {
        ...EMPTY_PAGE,
        title: "Main",
        slug: "test-service/index",
        category: "health",
        body: "Main information",
        linkType: "none",
      },
    );
    const guidance = appendServicePage(
      original,
      "apps/landing/src/content/test-service/help.md",
      {
        ...EMPTY_PAGE,
        title: "Help",
        slug: "test-service/help",
        category: "health",
        body: "Long guidance",
        linkType: "none",
      },
    );
    const linked = addJourneyLink(
      guidance,
      guidance.pages[0].id,
      guidance.pages[1].id,
      "Help with this service",
    );
    expect(original.pages[0].body).toBe("Main information");
    expect(linked.pages[0].body).toContain(
      "[Help with this service](/health/test-service/help)",
    );
    expect(linked.pages[1].body).toBe("Long guidance");
    expect(() =>
      appendServicePage(linked, linked.pages[1].path, EMPTY_PAGE),
    ).toThrow(/already uses/);
  });
  it("blocks invalid redirects, incomplete delivery, and conditions pointing forward", () => {
    const draft = snapshot();
    draft.recipe!.steps[1].behaviours![0] = {
      type: "stepConditionalOn",
      targetStepId: "another",
      targetFieldId: "x",
      operator: "equal",
      value: true,
    };
    draft.manifest.setup.delivery = "undecided";
    const issues = serviceReadiness(draft).issues;
    expect(issues).toContainEqual(expect.objectContaining({ id: "delivery" }));
    expect(issues).toContainEqual(
      expect.objectContaining({ id: "condition-conditional" }),
    );
    expect(
      serviceSnapshotSchema.safeParse({
        ...draft,
        manifest: { ...draft.manifest, formId: "different-form" },
      }).success,
    ).toBe(false);
  });
});

it("distinguishes the two NHC emails by recipient in the journey", () => {
  const draft = snapshot();
  draft.recipe!.processors = [
    { type: "email", config: { recipientField: "your-contact-details.email" } },
    { type: "email", config: { recipientField: "config.mdaEmail" } },
  ];
  const { nodes } = serviceJourney(draft, false, {
    "your-contact-details.email": "Email address",
  });
  expect(nodes.filter((n) => n.kind === "delivery")).toEqual([
    expect.objectContaining({
      title: "Email applicant",
      description: "To: answer to “Email address”",
    }),
    expect.objectContaining({
      title: "Email department",
      description: "To: department notification email",
    }),
  ]);
});

it("keeps public contact and fixed-address notifications out of applicant receipts", () => {
  const draft = snapshot();
  draft.manifest.setup.delivery = "configured";
  draft.recipe!.processors = [
    { type: "email", config: { recipientField: "contactDetails.email" } },
    { type: "email", config: { recipientField: "review@example.test" } },
    { type: "email", config: { recipientField: "catchment.mdaEmail" } },
  ];
  const actions = serviceJourney(draft, false).nodes.filter(
    (n) => n.kind === "delivery",
  );
  expect(actions.map((n) => n.title)).toEqual([
    "Email department",
    "Email recipient",
    "Email local office",
  ]);
  expect(actions[0].description).toBe("To: help@example.test");
  expect(actions[1].description).toBe("To: review@example.test");
  expect(
    serviceReadiness(draft).issues.some((i) => i.id === "applicant-choice"),
  ).toBe(false);
});

it("keeps redirects outside the map and connects visitors to their final destination", () => {
  const draft = snapshot();
  draft.manifest.pages = [
    {
      id: "main",
      title: "Apply",
      kind: "main",
      path: "apps/landing/src/content/apply/index.md",
      publicPath: "/health/apply",
    },
    {
      id: "old",
      title: "Apply",
      kind: "start",
      path: "apps/landing/src/content/apply/start.md",
      publicPath: "/health/apply/start",
    },
  ];
  draft.manifest.entryPoint = "main";
  draft.pages = [
    {
      id: "main",
      baseSha: null,
      path: draft.manifest.pages[0].path,
      body: "[Start](/health/apply/start)",
      frontmatter: {},
    },
    {
      id: "old",
      baseSha: null,
      path: draft.manifest.pages[1].path,
      body: "Old text that should not create a second route",
      frontmatter: { redirect_to: "/forms/test-service" },
    },
  ];
  const before = JSON.stringify(draft);
  const graph = serviceJourney(draft, false);
  const map = journeyMap(graph);
  expect(graph.nodes.find((node) => node.id === "old")?.kind).toBe("redirect");
  expect(map.nodes.some((node) => node.id === "old")).toBe(false);
  expect(map.edges).toContainEqual(
    expect.objectContaining({ from: "main", to: "form" }),
  );
  expect(map.nodes.some((node) => node.kind === "confirmation")).toBe(true);
  expect(JSON.stringify(draft)).toBe(before);
  expect(() => addJourneyLink(draft, "old", "form", "Start")).toThrow(
    /redirect/,
  );
  expect(() => addJourneyLink(draft, "main", "main", "Back")).toThrow(
    /different/,
  );
  expect(() => addJourneyLink(draft, "main", "old", "Start")).toThrow(
    /already links/,
  );
  draft.pages[1].frontmatter.redirect_to = "/health/apply/start";
  expect(
    journeyMap(serviceJourney(draft, false)).edges.some(
      (edge) => edge.to === "old",
    ),
  ).toBe(false);
});
