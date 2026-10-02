import {
  serviceDraftSchema,
  serviceManifestSchema,
  servicePagePathSchema,
  servicePendingConfigSchema,
  serviceReadiness,
  serviceSnapshotSchema,
  type ServiceSnapshot,
} from "./service-workspace.type";

const main = "2f5c0b16-2c0f-4877-b611-69933c4df678";
const help = "5dcbf56a-f1de-4d7b-9261-e27320612f55";
const start = "7aa1aeed-fcce-42b7-896a-3259a35bb5b8";
const contactId = "f4b47932-e4b2-48c5-85f3-981b1481aff9";
const sha = "0123456789abcdef0123456789abcdef01234567";

const path = (leaf: string) =>
  `apps/landing/src/content/test-service/${leaf}.md`;
const page = (
  id: string,
  leaf: string,
  kind: "main" | "guidance" | "start",
  title = leaf,
) => ({
  id,
  path: path(leaf),
  title,
  publicPath:
    leaf === "index" ? "/health/test-service" : `/health/test-service/${leaf}`,
  kind,
});
const draft = (
  id: string,
  leaf: string,
  frontmatter: Record<string, unknown> = {},
  body = `## ${leaf}\n\nBody`,
) => ({
  id,
  path: path(leaf),
  frontmatter: { title: leaf, ...frontmatter },
  body,
  baseSha: null,
});

const step = (stepId: string, elements = 1) => ({
  stepId,
  title: stepId,
  elements: Array.from({ length: elements }, () => ({
    ref: "components/generic-text",
  })),
});
const applicantEmail = {
  type: "email",
  config: { recipientField: "your-details.email", subject: "Received" },
};
const departmentEmail = {
  type: "email",
  config: { recipientField: "config.mdaEmail", subject: "New application" },
};
const recipe = {
  formId: "test-service",
  title: "Test service",
  steps: [
    step("your-details"),
    step("check-your-answers", 0),
    step("submission-confirmation", 0),
  ],
  processors: [applicantEmail, departmentEmail],
};
const payment = {
  type: "payment",
  config: {
    provider: "ezpay",
    department: "Health",
    paymentCode: "H1",
    amount: 25,
    description: "Fee",
    customerEmailPath: "your-details.email",
    customerNamePath: "your-details.name",
  },
};

const manifest = {
  schemaVersion: 1,
  serviceId: "test-service",
  visibility: "preview",
  title: "Test service",
  category: "health",
  formId: null,
  entryPoint: main,
  contactDetails: { email: "help@example.test" },
  pages: [page(main, "index", "main")],
};
const snapshot = (
  manifestOverrides: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): ServiceSnapshot =>
  serviceSnapshotSchema.parse({
    manifest: { ...manifest, ...manifestOverrides },
    pages: [draft(main, "index")],
    recipe: null,
    pendingConfig: { mdaContactId: null, processors: null },
    ...overrides,
  });
const withForm = (
  setup: Record<string, unknown>,
  recipeOverrides: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) =>
  snapshot(
    { formId: "test-service", setup: { step: "about", ...setup } },
    { recipe: { ...recipe, ...recipeOverrides }, ...overrides },
  );
const ids = (value: ServiceSnapshot) =>
  serviceReadiness(value).issues.map((i) => i.id);

describe("serviceManifestSchema", () => {
  it("fills defaults for a minimal manifest", () => {
    const parsed = serviceManifestSchema.parse({
      schemaVersion: 1,
      serviceId: "minimal",
      title: "  Minimal  ",
      formId: null,
      entryPoint: null,
      pages: [],
    });
    expect(parsed).toMatchObject({
      title: "Minimal",
      visibility: "draft",
      description: "",
      category: "",
      subcategory: "",
      setup: {
        step: "about",
        delivery: "undecided",
        applicantEmail: "undecided",
      },
    });
  });

  it("rejects pages sharing an id, path or public link", () => {
    expect(() =>
      serviceManifestSchema.parse({
        ...manifest,
        pages: [page(main, "index", "main"), page(main, "index", "guidance")],
      }),
    ).toThrow(/unique ids[\s\S]*unique paths[\s\S]*unique publicPaths/);
  });

  it("allows one main page only", () => {
    expect(() =>
      serviceManifestSchema.parse({
        ...manifest,
        pages: [page(main, "index", "main"), page(help, "help", "main")],
      }),
    ).toThrow(/one main page/);
  });

  it("requires the entry point to be an owned page or the connected form", () => {
    expect(() =>
      serviceManifestSchema.parse({ ...manifest, entryPoint: help }),
    ).toThrow(/page belonging to this service/);
    expect(() =>
      serviceManifestSchema.parse({ ...manifest, entryPoint: "form" }),
    ).toThrow(/Connect a form before using it/);
    expect(
      serviceManifestSchema.parse({
        ...manifest,
        entryPoint: "form",
        formId: "test-service",
      }).entryPoint,
    ).toBe("form");
  });

  it("only accepts Markdown pages inside the landing content directory", () => {
    expect(servicePagePathSchema.safeParse(path("help")).success).toBe(true);
    for (const bad of [
      "apps/api/src/x.md",
      path("Help"),
      "apps/landing/src/content/x.mdx",
    ])
      expect(servicePagePathSchema.safeParse(bad).success).toBe(false);
  });
});

describe("serviceSnapshotSchema", () => {
  it("keeps a form id while its recipe is unavailable, and readiness reports it", () => {
    const value = snapshot({ formId: "test-service" });
    expect(value.recipe).toBeNull();
    expect(ids(value)).toContain("missing-form");
  });

  it("rejects a recipe belonging to another form", () => {
    expect(() =>
      snapshot(
        { formId: "test-service" },
        { recipe: { ...recipe, formId: "other" } },
      ),
    ).toThrow(/form must belong to this service/);
  });

  it("requires every manifest page to be loaded as a draft", () => {
    expect(() => snapshot({}, { pages: [] })).toThrow(
      /Load all of the service pages/,
    );
    expect(() =>
      snapshot(
        {},
        { pages: [{ ...draft(main, "index"), path: path("other") }] },
      ),
    ).toThrow(/Load all of the service pages/);
  });

  it("keeps only payment configuration in the private sidecar", () => {
    expect(
      servicePendingConfigSchema.safeParse({
        mdaContactId: contactId,
        processors: [payment],
      }).success,
    ).toBe(true);
    expect(() =>
      servicePendingConfigSchema.parse({
        mdaContactId: null,
        processors: [departmentEmail],
      }),
    ).toThrow(/Only payment configuration/);
  });

  it("extends a snapshot into a draft with revision metadata", () => {
    const value = serviceDraftSchema.parse({
      ...snapshot(),
      baseManifestSha: sha,
      revision: 2,
      updatedAt: "2026-09-12T00:00:00.000Z",
      updatedBy: "editor",
    });
    expect(value).toMatchObject({
      revision: 2,
      updatedBy: "editor",
      baseManifestSha: sha,
    });
  });
});

describe("serviceReadiness", () => {
  it("is ready when every component is complete", () => {
    const value = withForm({
      delivery: "configured",
      applicantEmail: "configured",
    });
    expect(serviceReadiness(value)).toEqual({ ready: true, issues: [] });
  });

  it("reports release, category and entry point gaps", () => {
    expect(
      ids(snapshot({ visibility: "draft", category: "", entryPoint: null })),
    ).toEqual(["visibility", "category", "entry"]);
  });

  it("accepts public contact details from the recipe and requires an email or telephone", () => {
    const fromRecipe = withForm(
      { delivery: "configured", applicantEmail: "configured" },
      { contactDetails: { telephoneNumber: "246 000 0000" } },
    );
    fromRecipe.manifest.contactDetails = undefined;
    expect(ids(fromRecipe)).toEqual([]);
    const none = snapshot();
    none.manifest.contactDetails = undefined;
    expect(ids(none)).toEqual(["contact"]);
    const invalid = snapshot();
    invalid.manifest.contactDetails = { email: "not-an-email" };
    expect(ids(invalid)).toEqual(["contact-email"]);
  });

  it("asks for unfinished pages by title and flags pages linked to another form", () => {
    const value = snapshot(
      {
        pages: [
          page(main, "index", "main", "Main page"),
          page(help, "help", "guidance"),
        ],
      },
      {
        pages: [
          draft(main, "index", {}, "   "),
          draft(help, "help", { title: "", form_id: "other-form" }),
        ],
      },
    );
    expect(serviceReadiness(value).issues).toEqual([
      { id: main, section: "pages", message: "Finish Main page" },
      { id: help, section: "pages", message: "Finish help" },
      {
        id: `${help}-form`,
        section: "pages",
        message: "A page links to a different service's form",
      },
    ]);
    const orphan = snapshot();
    orphan.pages = [...orphan.pages, draft(start, "start", {}, "")];
    expect(serviceReadiness(orphan).issues).toContainEqual({
      id: start,
      section: "pages",
      message: "Finish the content page",
    });
  });

  it("checks redirects point at another service page that does not redirect itself", () => {
    const pages = [
      page(main, "index", "main"),
      page(help, "help", "guidance"),
      page(start, "start", "start"),
    ];
    const redirecting = (helpTarget: unknown, startTarget?: unknown) =>
      snapshot(
        { pages },
        {
          pages: [
            draft(main, "index"),
            draft(help, "help", { redirect_to: helpTarget }),
            draft(
              start,
              "start",
              startTarget === undefined ? {} : { redirect_to: startTarget },
            ),
          ],
        },
      );
    expect(ids(redirecting("/health/test-service"))).toEqual([]);
    expect(ids(redirecting("/health/test-service/help"))).toEqual([
      `${help}-redirect`,
    ]);
    expect(ids(redirecting("/elsewhere"))).toEqual([`${help}-redirect`]);
    expect(ids(redirecting(42))).toEqual([`${help}-redirect`]);
    expect(
      ids(redirecting("/health/test-service/start", "/health/test-service")),
    ).toEqual([`${help}-redirect`]);
  });

  it("requires questions, a confirmation page and delivery decisions once a form is connected", () => {
    const bare = withForm(
      {},
      {
        steps: [step("check-your-answers", 0), step("declaration", 0)],
        processors: undefined,
      },
    );
    expect(ids(bare)).toEqual([
      "questions",
      "confirmation",
      "delivery",
      "applicant-email",
    ]);
  });

  it("checks the applicant email choice against the recipe's email actions", () => {
    expect(
      ids(
        withForm(
          { delivery: "configured", applicantEmail: "configured" },
          { processors: [departmentEmail] },
        ),
      ),
    ).toEqual(["applicant-question"]);
    expect(
      ids(withForm({ delivery: "configured", applicantEmail: "none" })),
    ).toEqual(["applicant-choice"]);
  });

  it("checks the delivery choice against delivery actions and pending payments", () => {
    expect(
      ids(withForm({ delivery: "none", applicantEmail: "configured" })),
    ).toEqual(["delivery-choice"]);
    expect(
      ids(
        withForm(
          { delivery: "none", applicantEmail: "configured" },
          { processors: [applicantEmail] },
          { pendingConfig: { mdaContactId: contactId, processors: [payment] } },
        ),
      ),
    ).toEqual(["delivery-choice"]);
    expect(
      ids(
        withForm(
          { delivery: "configured", applicantEmail: "configured" },
          { processors: [applicantEmail] },
        ),
      ),
    ).toEqual(["delivery-action"]);
    expect(
      ids(
        withForm(
          { delivery: "configured", applicantEmail: "configured" },
          { processors: [applicantEmail] },
          { pendingConfig: { mdaContactId: contactId, processors: [payment] } },
        ),
      ),
    ).toEqual([]);
  });

  it("requires step conditions to refer to an earlier page", () => {
    const value = withForm({
      delivery: "configured",
      applicantEmail: "configured",
    });
    const condition = (targetStepId: unknown) => ({
      type: "stepConditionalOn",
      targetFieldId: "email",
      targetStepId,
      operator: "equals",
      value: "yes",
    });
    const steps = [
      {
        ...step("your-details"),
        behaviours: [{ type: "repeatable" }, condition(42)],
      },
      {
        ...step("eligibility"),
        title: undefined,
        behaviours: [condition("your-details")],
      },
      {
        ...step("documents"),
        behaviours: [
          condition("missing"),
          condition("submission-confirmation"),
        ],
      },
      step("submission-confirmation", 0),
    ];
    const withConditions = {
      ...value,
      recipe: { ...value.recipe!, steps },
    } as unknown as ServiceSnapshot;
    expect(serviceReadiness(withConditions).issues).toEqual([
      {
        id: "condition-documents",
        section: "pages",
        message: "documents has a condition that must refer to an earlier page",
      },
      {
        id: "condition-documents",
        section: "pages",
        message: "documents has a condition that must refer to an earlier page",
      },
    ]);
    const nameless = {
      ...value,
      recipe: {
        ...value.recipe!,
        steps: [
          {
            ...step("your-details"),
            title: undefined,
            behaviours: [condition("later")],
          },
          step("later"),
          step("submission-confirmation", 0),
        ],
      },
    } as unknown as ServiceSnapshot;
    expect(serviceReadiness(nameless).issues[0]).toMatchObject({
      id: "condition-your-details",
      message:
        "your-details has a condition that must refer to an earlier page",
    });
  });
});
