/** @vitest-environment jsdom */
import { expect } from "vitest";
import { act, renderHook } from "../../../test/ui";
import {
  mergeServiceRows,
  useServiceState,
} from "../../services/service-state";
import { getCatalog } from "@govtech-bb/form-builder";
import {
  draftRecipeSchema,
  serviceSnapshotSchema,
  validateFormContract,
} from "@govtech-bb/form-types";
import { getRecipe, getFormConfig } from "../../../server/forms";
import {
  getServiceUser,
  loadServiceSource,
  saveServiceRecipe,
} from "../../../server/services";
import { getCatalogFn, validateRecipe } from "../../../server/registry";
import {
  getServiceDraft,
  listServiceDrafts,
  saveServiceDraft,
  saveServicePage,
} from "../../../lib/service-drafts";
import {
  prepareServiceEdit,
  readService,
  readPage,
  readForm,
} from "./service-tools";

vi.mock("../../../server/forms", () => ({
  getRecipe: vi.fn(),
  getFormConfig: vi.fn(),
}));
vi.mock("../../../server/services", () => ({
  getServiceUser: vi.fn(),
  loadServiceSource: vi.fn(),
  saveServiceRecipe: vi.fn(),
  getFormSourceSha: vi.fn(),
  retainServiceVersion: vi.fn(),
  publishServiceVersion: vi.fn(),
  getServicePublication: vi.fn(),
}));
vi.mock("../../../server/registry", () => ({
  getCatalogFn: vi.fn(),
  validateRecipe: vi.fn(),
}));

const serviceId = "test-service";
const ids = [
  "aa984ddf-ac15-43dc-a817-4559cfb37c4d",
  "27c07c89-4d8c-440e-89c9-ac44ab91d1ab",
];
const paths = ["index", "help"].map(
  (name) => `apps/landing/src/content/${serviceId}/${name}.md`,
);
const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId,
    title: "Test service",
    category: "education",
    formId: null,
    entryPoint: ids[0],
    setup: { step: "delivery", delivery: "none", applicantEmail: "none" },
    pages: ids.map((id, i) => ({
      id,
      path: paths[i],
      title: i ? "Help" : "Main",
      kind: i ? "guidance" : "main",
      publicPath: `/education/${serviceId}${i ? "/help" : ""}`,
    })),
  },
  pages: ids.map((id, i) => ({
    id,
    path: paths[i],
    frontmatter: {
      title: i ? "Help" : "Main",
      category: "education",
      apiKey: "private-key",
    },
    body: i ? "Guidance" : "Main page",
    baseSha: null,
  })),
  recipe: null,
  pendingConfig: { mdaContactId: null, processors: null },
});

beforeEach(async () => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(getServiceUser).mockResolvedValue("editor");
  vi.mocked(getRecipe).mockRejectedValue(new Error("Offline"));
  vi.mocked(getFormConfig).mockResolvedValue(snapshot.pendingConfig);
  vi.mocked(getCatalogFn).mockResolvedValue(getCatalog());
  vi.mocked(validateRecipe).mockImplementation(async ({ data }) =>
    validateFormContract(data.recipe),
  );
  await saveServiceDraft({ data: { snapshot, expectedRevision: 0 } });
});

it("patches a service page, advances its revision, and keeps its sibling and private frontmatter", async () => {
  const change = await prepareServiceEdit("apply_content_patch", {
    summary: "Improve help",
    target: { serviceId, pagePath: paths[1] },
    patch: { body: "Updated guidance" },
  });
  expect(change.external).toBe(true);
  expect(change.before.body).toBe("Guidance");
  await change.apply();
  const saved = await getServiceDraft({ data: { serviceId } });
  expect(saved.revision).toBe(2);
  expect(saved.pages.map((page) => page.body)).toEqual([
    "Main page",
    "Updated guidance",
  ]);
  expect(saved.pages[1].frontmatter.apiKey).toBe("private-key");
  expect(saveServiceRecipe).not.toHaveBeenCalled();
});

it("rejects a concurrent write after preparing a proposal", async () => {
  const change = await prepareServiceEdit("apply_content_patch", {
    summary: "Update",
    target: { serviceId, pagePath: paths[1] },
    patch: { body: "AI edit" },
  });
  await saveServicePage({
    data: {
      serviceId,
      expectedRevision: 1,
      page: { ...snapshot.pages[0], body: "Another editor" },
    },
  });
  await expect(change.apply()).rejects.toThrow("Another tab saved");
  const saved = await getServiceDraft({ data: { serviceId } });
  expect(saved.pages.map((page) => page.body)).toEqual([
    "Another editor",
    "Guidance",
  ]);
});

it("creates a separate draft page and rejects URL collisions", async () => {
  const proposal = {
    summary: "Add FAQ",
    target: { serviceId },
    operation: "create" as const,
    patch: { slug: "faq", title: "FAQ", body: "Answers" },
  };
  const change = await prepareServiceEdit("apply_content_patch", proposal);
  expect(change.createPage).toBe(true);
  await change.apply();
  const saved = await getServiceDraft({ data: { serviceId } });
  expect(saved.pages).toHaveLength(3);
  expect(saved.pages[2]).toMatchObject({
    path: `apps/landing/src/content/${serviceId}/faq.md`,
    body: "Answers",
    frontmatter: { visibility: "draft" },
  });
  await expect(
    prepareServiceEdit("apply_content_patch", proposal),
  ).rejects.toThrow("already uses");
});

it("limits service details to valid draft fields and preserves unpatched setup values", async () => {
  await expect(
    prepareServiceEdit("update_service_details", {
      summary: "Change",
      target: { serviceId },
      patch: { category: "invented" },
    }),
  ).rejects.toThrow("category");
  await expect(
    prepareServiceEdit("apply_content_patch", {
      summary: "Change",
      target: { serviceId, pagePath: paths[0] },
      patch: { category: "invented" },
    }),
  ).rejects.toThrow("category");
  await expect(
    prepareServiceEdit("update_service_details", {
      summary: "Publish",
      target: { serviceId },
      patch: { visibility: "public" },
    }),
  ).rejects.toThrow();
  const change = await prepareServiceEdit("update_service_details", {
    summary: "Rename",
    target: { serviceId },
    patch: { title: "New title", setup: { step: "check" } },
  });
  await change.apply();
  expect(
    (await getServiceDraft({ data: { serviceId } })).manifest,
  ).toMatchObject({
    title: "New title",
    setup: { step: "check", delivery: "none", applicantEmail: "none" },
  });
});

it("refuses unknown services and pages without adopting them, redacts reads, and caps output size", async () => {
  await expect(readService({ serviceId: "unknown" })).rejects.toThrow(
    "Open this service",
  );
  await expect(
    prepareServiceEdit("update_service_details", {
      summary: "Edit",
      target: { serviceId: "unknown" },
      patch: { title: "New" },
    }),
  ).rejects.toThrow("Open this service");
  await expect(
    readPage({ serviceId, pagePath: "apps/landing/src/content/other.md" }),
  ).rejects.toThrow("does not belong");
  expect(loadServiceSource).not.toHaveBeenCalled();
  const page = await readPage({ serviceId, pagePath: paths[0] });
  expect(JSON.stringify(page)).not.toContain("private-key");
  expect(JSON.stringify(page)).toContain("__REDACTED__");
  await saveServicePage({
    data: {
      serviceId,
      expectedRevision: 1,
      page: { ...snapshot.pages[0], body: "x".repeat(200_001) },
    },
  });
  await expect(readPage({ serviceId, pagePath: paths[0] })).rejects.toThrow(
    "too large",
  );
});

it("edits an existing form through the recipe save and does not attach a missing form", async () => {
  const proposal = {
    summary: "Rename form",
    target: { serviceId },
    recipe: { formId: "changed-id", title: "Updated form", steps: [] },
  };
  await expect(
    prepareServiceEdit("apply_form_draft", proposal),
  ).rejects.toThrow("Connect an application");
  const recipe = draftRecipeSchema.parse({
    formId: "application",
    title: "Original",
    steps: [],
  });
  await saveServiceDraft({
    data: {
      expectedRevision: 1,
      snapshot: {
        ...snapshot,
        manifest: { ...snapshot.manifest, formId: recipe.formId },
        recipe,
      },
    },
  });
  vi.mocked(saveServiceRecipe).mockClear();
  const change = await prepareServiceEdit("apply_form_draft", proposal);
  await change.apply();
  expect(validateRecipe).toHaveBeenCalled();
  expect(saveServiceRecipe).toHaveBeenCalledExactlyOnceWith({
    data: expect.objectContaining({
      recipe: expect.objectContaining({
        formId: "application",
        title: "Updated form",
      }),
      expectedRecipe: recipe,
    }),
  });
  expect(await readForm({ serviceId })).toMatchObject({
    recipe: { formId: "application", title: "Updated form" },
  });
});

it("refreshes the service workspace and rejects a stale setup snapshot after an assistant save", async () => {
  const [service] = mergeServiceRows([], await listServiceDrafts());
  const { result } = renderHook(() => useServiceState(service));
  await act(async () => Promise.resolve());
  const setupSnapshot = result.current.draft!;
  await act(async () => {
    const change = await prepareServiceEdit("update_service_details", {
      summary: "Rename",
      target: { serviceId },
      patch: { title: "Assistant title" },
    });
    await change.apply();
  });
  expect(result.current.draft?.revision).toBe(2);
  await act(async () => {
    expect(await result.current.save(setupSnapshot)).toBeNull();
  });
  expect(result.current.error).toContain("Another tab saved");
  expect((await getServiceDraft({ data: { serviceId } })).manifest.title).toBe(
    "Assistant title",
  );
});
