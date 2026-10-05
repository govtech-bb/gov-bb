/** @vitest-environment jsdom */
import {
  draftRecipeSchema,
  serviceSnapshotSchema,
} from "@govtech-bb/form-types";
import { getRecipe, getFormConfig } from "../server/forms";
import { getServiceUser, saveServiceRecipe } from "../server/services";
import {
  saveServiceDraft,
  saveServicePage,
  saveServiceForm,
  getServiceDraft,
  attachServiceForm,
} from "./service-drafts";
vi.mock("../server/forms", () => ({
  getRecipe: vi.fn(),
  getFormConfig: vi.fn(),
}));
vi.mock("../server/services", () => ({
  getServiceUser: vi.fn(),
  loadServiceSource: vi.fn(),
  saveServiceRecipe: vi.fn(),
  getFormSourceSha: vi.fn(async () => null),
  retainServiceVersion: vi.fn(),
  publishServiceVersion: vi.fn(),
  getServicePublication: vi.fn(),
}));
const pageId = "aa984ddf-ac15-43dc-a817-4559cfb37c4d";
const helpId = "27c07c89-4d8c-440e-89c9-ac44ab91d1ab";
const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId: "test-service",
    title: "Test service",
    category: "health",
    formId: null,
    entryPoint: pageId,
    pages: [
      {
        id: pageId,
        path: "apps/landing/src/content/test-service/index.md",
        title: "Main",
        kind: "main",
        publicPath: "/health/test-service",
      },
      {
        id: helpId,
        path: "apps/landing/src/content/test-service/help.md",
        title: "Help",
        kind: "guidance",
        publicPath: "/health/test-service/help",
      },
    ],
  },
  pages: [pageId, helpId].map((id, i) => ({
    id,
    path: `apps/landing/src/content/test-service/${i ? "help" : "index"}.md`,
    frontmatter: { title: i ? "Help" : "Main", category: "health" },
    body: i ? "Extra guidance" : "Main service content",
    baseSha: null,
  })),
  recipe: null,
  pendingConfig: { mdaContactId: null, processors: null },
});
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(getServiceUser).mockResolvedValue("editor");
  vi.mocked(getFormConfig).mockResolvedValue(snapshot.pendingConfig);
});
it("saves a separate guidance page, retains the main page, and rejects a stale tab without a form write", async () => {
  const draft = await saveServiceDraft({
    data: { snapshot, expectedRevision: 0 },
  });
  const saved = await saveServicePage({
    data: {
      serviceId: "test-service",
      expectedRevision: draft.revision,
      page: { ...draft.pages[1], body: "Revised guidance" },
    },
  });
  expect(saved.pages.map((p) => p.body)).toEqual([
    "Main service content",
    "Revised guidance",
  ]);
  await expect(
    saveServiceDraft({ data: { snapshot, expectedRevision: draft.revision } }),
  ).rejects.toThrow("Another tab");
  expect(saveServiceRecipe).not.toHaveBeenCalled();
});
it("connects one existing form, keeps repeated loads stable, and saves edits through the existing form adapter", async () => {
  const recipe = draftRecipeSchema.parse({
    title: "Application",
    formId: "test-form",
    steps: [],
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  });
  vi.mocked(getRecipe).mockResolvedValue(
    recipe as Awaited<ReturnType<typeof getRecipe>>,
  );
  const initial = await saveServiceDraft({
    data: { snapshot, expectedRevision: 0 },
  });
  const connected = await attachServiceForm({
    data: {
      serviceId: "test-service",
      expectedRevision: initial.revision,
      formId: "test-form",
    },
  });
  expect(saveServiceRecipe).not.toHaveBeenCalled();
  const first = await getServiceDraft({ data: { serviceId: "test-service" } });
  expect(first.revision).toBe(connected.revision);
  expect(
    (await getServiceDraft({ data: { serviceId: "test-service" } })).revision,
  ).toBe(first.revision);
  const edited = { ...recipe, title: "Updated application" };
  const saved = await saveServiceForm({
    data: {
      serviceId: "test-service",
      expectedRevision: first.revision,
      recipe: edited,
      pendingConfig: snapshot.pendingConfig,
    },
  });
  expect(saveServiceRecipe).toHaveBeenCalledExactlyOnceWith({
    data: {
      recipe: edited,
      expectedRecipe: recipe,
      pendingConfig: snapshot.pendingConfig,
    },
  });
  expect(saved.recipe?.title).toBe("Updated application");
  await expect(
    attachServiceForm({
      data: {
        serviceId: "test-service",
        expectedRevision: saved.revision,
        formId: "second-form",
      },
    }),
  ).rejects.toThrow("already has an application");
});
// A service published with content pages only: `save()` seeds a manifest
// while `baseManifestSha` is null, so attaching a form later must carry the
// recipe's contact details over itself (#2894).
const publishedPagesOnly = {
  ...snapshot,
  baseManifestSha: "0123456789abcdef0123456789abcdef01234567",
};
const withContact = draftRecipeSchema.parse({
  title: "Application",
  formId: "test-form",
  steps: [],
  contactDetails: { email: "health@gov.bb", telephoneNumber: "246-555-0100" },
});
const withoutContact = draftRecipeSchema.parse({
  title: "Application",
  formId: "test-form",
  steps: [],
});
it("attaching a form to a published service inherits the recipe's contact details (#2894)", async () => {
  vi.mocked(getRecipe).mockResolvedValue(withContact as never);
  const published = await saveServiceDraft({
    data: { snapshot: publishedPagesOnly, expectedRevision: 0 },
  });
  expect(published.manifest.contactDetails).toBeUndefined();
  const connected = await attachServiceForm({
    data: {
      serviceId: "test-service",
      expectedRevision: published.revision,
      formId: "test-form",
    },
  });
  expect(connected.manifest.contactDetails).toEqual(withContact.contactDetails);
  expect(
    (await getServiceDraft({ data: { serviceId: "test-service" } })).manifest
      .contactDetails,
  ).toEqual(withContact.contactDetails);
});
it("keeps the manifest's own contact details when attaching a form that has its own", async () => {
  vi.mocked(getRecipe).mockResolvedValue(withContact as never);
  const own = { email: "registry@gov.bb" };
  const published = await saveServiceDraft({
    data: {
      snapshot: {
        ...publishedPagesOnly,
        manifest: { ...publishedPagesOnly.manifest, contactDetails: own },
      },
      expectedRevision: 0,
    },
  });
  const connected = await attachServiceForm({
    data: {
      serviceId: "test-service",
      expectedRevision: published.revision,
      formId: "test-form",
    },
  });
  expect(connected.manifest.contactDetails).toEqual(own);
});
it("leaves contactDetails off the manifest when neither it nor the recipe has one", async () => {
  // Same shape seedServiceManifest writes: no key, not `undefined`.
  vi.mocked(getRecipe).mockResolvedValue(withoutContact as never);
  const published = await saveServiceDraft({
    data: { snapshot: publishedPagesOnly, expectedRevision: 0 },
  });
  const connected = await attachServiceForm({
    data: {
      serviceId: "test-service",
      expectedRevision: published.revision,
      formId: "test-form",
    },
  });
  expect(connected.manifest).not.toHaveProperty("contactDetails");
});
const applicantEmailOnly = draftRecipeSchema.parse({
  formId: "test-form",
  title: "Application",
  steps: [],
  processors: [
    { type: "email", config: { recipientField: "your-details.email" } },
  ],
});
// What the earlier seed stored for a form whose only action is the applicant
// confirmation email: readiness rejected it as "Add a delivery action".
const staleSetup = {
  step: "about",
  delivery: "configured",
  applicantEmail: "undecided",
} as const;
it("re-seeds a draft adopted before #2683 on refresh until the author decides", async () => {
  // Stored by the earlier seed: the retired visibility key and a delivery it
  // decided alone.
  localStorage.setItem(
    "service-workspace:v1:editor:test-service",
    JSON.stringify({
      ...snapshot,
      recipe: applicantEmailOnly,
      manifest: {
        ...snapshot.manifest,
        visibility: "draft",
        formId: "test-form",
        setup: staleSetup,
      },
      revision: 4,
      updatedAt: "2026-09-14T00:00:00.000Z",
      updatedBy: "editor",
    }),
  );
  vi.mocked(getRecipe).mockResolvedValue(applicantEmailOnly as never);
  const refreshed = await getServiceDraft({
    data: { serviceId: "test-service" },
  });
  expect(refreshed.revision).toBe(5);
  expect(refreshed.manifest).not.toHaveProperty("visibility");
  expect(refreshed.manifest.setup).toEqual({
    step: "about",
    delivery: "none",
    applicantEmail: "configured",
  });
  expect(
    (await getServiceDraft({ data: { serviceId: "test-service" } })).revision,
  ).toBe(5);
  const decided = await saveServiceDraft({
    data: {
      snapshot: {
        ...refreshed,
        manifest: {
          ...refreshed.manifest,
          setup: { ...refreshed.manifest.setup, applicantEmail: "none" },
        },
      },
      expectedRevision: 5,
    },
  });
  const kept = await getServiceDraft({ data: { serviceId: "test-service" } });
  expect(kept.revision).toBe(decided.revision);
  expect(kept.manifest.setup.applicantEmail).toBe("none");
});
it("seeds a never-published manifest on save so a refresh never bumps the revision", async () => {
  vi.mocked(getRecipe).mockResolvedValue(applicantEmailOnly as never);
  const saved = await saveServiceDraft({
    data: {
      snapshot: {
        ...snapshot,
        recipe: applicantEmailOnly,
        manifest: {
          ...snapshot.manifest,
          formId: "test-form",
          setup: staleSetup,
        },
      },
      expectedRevision: 0,
    },
  });
  expect(saved.manifest.setup).toEqual({
    step: "about",
    delivery: "none",
    applicantEmail: "configured",
  });
  const refreshed = await getServiceDraft({
    data: { serviceId: "test-service" },
  });
  expect(refreshed.revision).toBe(saved.revision);
});
it("keeps a decided pair that disagrees with the recipe's actions (ADR 0073)", async () => {
  // Decided through the Details page or the assistant; readiness, not the
  // seed, is what asks the author to reconcile it with the actions.
  const decided = {
    step: "about",
    delivery: "configured",
    applicantEmail: "none",
  } as const;
  vi.mocked(getRecipe).mockResolvedValue(applicantEmailOnly as never);
  const saved = await saveServiceDraft({
    data: {
      snapshot: {
        ...snapshot,
        recipe: applicantEmailOnly,
        manifest: {
          ...snapshot.manifest,
          formId: "test-form",
          setup: decided,
        },
      },
      expectedRevision: 0,
    },
  });
  expect(saved.manifest.setup).toEqual(decided);
  const refreshed = await getServiceDraft({
    data: { serviceId: "test-service" },
  });
  expect(refreshed.revision).toBe(saved.revision);
  expect(refreshed.manifest.setup).toEqual(decided);
});
it("leaves a published manifest as the author saved it", async () => {
  vi.mocked(getRecipe).mockResolvedValue(applicantEmailOnly as never);
  const published = await saveServiceDraft({
    data: {
      snapshot: {
        ...snapshot,
        recipe: applicantEmailOnly,
        baseManifestSha: "0123456789abcdef0123456789abcdef01234567",
        manifest: {
          ...snapshot.manifest,
          formId: "test-form",
          setup: staleSetup,
        },
      },
      expectedRevision: 0,
    },
  });
  expect(published.manifest.setup).toEqual(staleSetup);
  const refreshed = await getServiceDraft({
    data: { serviceId: "test-service" },
  });
  expect(refreshed.revision).toBe(published.revision);
  expect(refreshed.manifest.setup).toEqual(staleSetup);
});
it("retains newer page edits when an older recipe refresh finishes", async () => {
  const recipe = draftRecipeSchema.parse({
    formId: "test-form",
    title: "Application",
    steps: [],
  });
  const initial = await saveServiceDraft({
    data: {
      snapshot: {
        ...snapshot,
        recipe,
        manifest: { ...snapshot.manifest, formId: "test-form" },
      },
      expectedRevision: 0,
    },
  });
  let finish!: (recipe: unknown) => void;
  vi.mocked(getRecipe).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
  );
  const loading = getServiceDraft({ data: { serviceId: "test-service" } });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const edited = await saveServiceDraft({
    data: {
      snapshot: {
        ...initial,
        pages: initial.pages.map((p) => ({ ...p, body: "New content" })),
      },
      expectedRevision: initial.revision,
    },
  });
  finish({ ...recipe, title: "Updated elsewhere" });
  const refreshed = await loading;
  expect(refreshed.revision).toBe(edited.revision);
  expect(refreshed.pages.every((p) => p.body === "New content")).toBe(true);
});
