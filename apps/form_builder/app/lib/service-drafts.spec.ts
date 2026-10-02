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
