import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// This recipe splits into two routes (yourself / an organisation) and every
// way it can go wrong is SILENT: validate-recipes and recipe-invariants.spec.ts
// only check that ids are unique and refs resolve, not that the right steps
// show on the right route. A wrong gate shows the self route the
// organisation's steps (or stops it at the no-permission page), an email
// processor pointed at a route-specific step finds no recipient on the other
// route and the applicant never gets a confirmation, and a registry default
// (required National Registration Number, "after today" start date) quietly
// brings back a rule the content review removed (#2914).
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/mohlm-application-use-state-land.json",
);

type Behaviour = { type: string; [key: string]: unknown };

type HydratedField = {
  fieldId: string;
  validations?: Record<string, Record<string, unknown>>;
  behaviours?: Behaviour[];
};

type HydratedStep = {
  stepId: string;
  title: string;
  behaviours?: Behaviour[];
  elements: HydratedField[];
};

async function hydratedSteps(): Promise<HydratedStep[]> {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  // Every ref in this recipe is a builtin, so a miss is a bug in the recipe.
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  const hydrated = await hydrateForm(recipe, resolver);
  return hydrated.steps as unknown as HydratedStep[];
}

async function step(stepId: string): Promise<HydratedStep> {
  const found = (await hydratedSteps()).find((s) => s.stepId === stepId);
  expect(found, `step "${stepId}" is missing from the recipe`).toBeDefined();
  return found!;
}

async function field(stepId: string, fieldId: string): Promise<HydratedField> {
  const found = (await step(stepId)).elements.find(
    (e) => e.fieldId === fieldId,
  );
  expect(found, `field "${fieldId}" is missing from "${stepId}"`).toBeDefined();
  return found!;
}

function stepGates(s: HydratedStep): Behaviour[] {
  return (s.behaviours ?? []).filter((b) => b.type === "stepConditionalOn");
}

const onRoute = (value: "yourself" | "organisation") => ({
  type: "stepConditionalOn",
  targetStepId: "who-are-you-applying-for",
  targetFieldId: "applying-for",
  operator: "equal",
  value,
});

it("asks the steps in the reviewed order", async () => {
  const steps = await hydratedSteps();

  expect(steps.map((s) => s.stepId)).toEqual([
    "who-are-you-applying-for",
    "no-permission",
    "your-details",
    "organisation-details",
    "contact-person",
    "how-should-we-contact-you",
    "tell-us-about-the-land",
    "how-do-you-want-to-use-the-land",
    "upload-your-documents",
    "check-your-answers",
    "declaration",
    "submission-confirmation",
  ]);
});

describe("route gates", () => {
  it("shows Your details only on the self route", async () => {
    expect(stepGates(await step("your-details"))).toEqual([
      onRoute("yourself"),
    ]);
  });

  it("shows Organisation details and Contact person only on the organisation route", async () => {
    expect(stepGates(await step("organisation-details"))).toEqual([
      onRoute("organisation"),
    ]);
    expect(stepGates(await step("contact-person"))).toEqual([
      onRoute("organisation"),
    ]);
  });

  // Gate values are not cleared when a field is hidden, so a "No" left behind
  // after switching to "Yourself" would still match `has-permission = no`. The
  // route condition stops that stale answer stranding the self route.
  it("stops the organisation route without permission, and only that route", async () => {
    expect(stepGates(await step("no-permission"))).toEqual([
      onRoute("organisation"),
      {
        type: "stepConditionalOn",
        targetStepId: "who-are-you-applying-for",
        targetFieldId: "has-permission",
        operator: "equal",
        value: "no",
      },
    ]);
  });

  // Same stale-answer risk at field level: the relationship question must not
  // reappear on the self route from a leftover "Yes".
  it("asks the relationship to the organisation only on the organisation route", async () => {
    const relationship = await field(
      "who-are-you-applying-for",
      "relationship-to-organisation",
    );

    expect(relationship.behaviours).toEqual([
      {
        type: "fieldConditionalOn",
        targetFieldId: "applying-for",
        operator: "equal",
        value: "organisation",
      },
      {
        type: "fieldConditionalOn",
        targetFieldId: "has-permission",
        operator: "equal",
        value: "yes",
      },
    ]);
  });

  it("asks how to contact you on both routes", async () => {
    expect(stepGates(await step("how-should-we-contact-you"))).toEqual([]);
  });
});

// The single email processor must name a step every applicant reaches —
// otherwise one route resolves no recipient and gets no confirmation.
it("sends the confirmation to an email address both routes collect", async () => {
  const { processors } = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const emails = processors.filter((p: { type: string }) => p.type === "email");

  expect(emails).toEqual([
    {
      type: "email",
      config: {
        subject: "Application received: use government land",
        recipientField: "how-should-we-contact-you.email",
      },
    },
  ]);

  const email = await field("how-should-we-contact-you", "email");
  expect(email.validations?.required).toMatchObject({ value: true });
});

it("lets the start date be in the past", async () => {
  const start = await field("how-do-you-want-to-use-the-land", "start-date");
  expect(start.validations).not.toHaveProperty("futureOrToday");
});

it("asks for the end date only when known, and not before the start", async () => {
  const end = await field("how-do-you-want-to-use-the-land", "end-date");

  expect(end.behaviours).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: "knows-duration",
      operator: "equal",
      value: "yes",
    },
  ]);
  expect(end.validations?.onOrAfter).toMatchObject({
    referenceFieldId: "start-date",
  });
});

it("keeps the National Registration Number optional but still format-checked", async () => {
  const nrn = await field("your-details", "national-id-number");

  expect(nrn.validations?.required).toMatchObject({ value: false });
  expect(
    nrn.validations?.pattern,
    "the registry's 870315-1234 format check was lost",
  ).toBeDefined();
});

it("asks no sex or gender, and no address or ID for the contact person", async () => {
  const steps = await hydratedSteps();
  const fieldIds = steps.flatMap((s) => s.elements.map((e) => e.fieldId));

  expect(fieldIds.filter((id) => /sex|gender/.test(id))).toEqual([]);

  const contactIds = (await step("contact-person")).elements.map(
    (e) => e.fieldId,
  );
  expect(
    contactIds.filter((id) =>
      /address|parish|country|town|postal|national-id/.test(id),
    ),
  ).toEqual([]);
});

// Content (#2914, 7 Oct): keep middle name, optional, on both people we ask
// about. The registry component sets no `required`, so the recipe must say
// `false` explicitly or a later registry default could make it mandatory.
it.each([
  ["your-details", "applicant-middle-name"],
  ["contact-person", "contact-middle-name"],
])("asks %s for an optional middle name", async (stepId, fieldId) => {
  const middle = await field(stepId, fieldId);
  expect(middle.validations?.required).toMatchObject({ value: false });
});
