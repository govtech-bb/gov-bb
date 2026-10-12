/** @vitest-environment jsdom */
import userEvent from "@testing-library/user-event";
import {
  serviceSnapshotSchema,
  type BuilderFormSummary,
  type ServiceDraft,
} from "@govtech-bb/form-types";
import {
  render,
  respondToConfirmation,
  screen,
  waitFor,
  within,
} from "../../test/ui";
import { deleteForm, disableForm } from "../../server/forms";
import { getServiceUser } from "../../server/services";
import {
  listServiceCheckpoints,
  listServiceDrafts,
  saveServiceDraft,
} from "../../lib/service-drafts";
import { draftKeyFor, writeDraft } from "../content/draft-store";
import { ServiceDelete } from "./service-delete";
import type { ServiceRow } from "./service-model";
import type { ServiceState } from "./service-state";

vi.mock("../../server/forms", () => ({
  deleteForm: vi.fn(async () => undefined),
  disableForm: vi.fn(async () => undefined),
  enableForm: vi.fn(),
  getRecipe: vi.fn(),
  getFormConfig: vi.fn(),
}));
vi.mock("../../server/publish", () => ({ eraseRecipe: vi.fn() }));
vi.mock("../../server/services", () => ({
  getServiceUser: vi.fn(),
  loadServiceSource: vi.fn(),
  saveServiceRecipe: vi.fn(),
  getFormSourceSha: vi.fn(async () => null),
  retainServiceVersion: vi.fn(),
  publishServiceVersion: vi.fn(),
  getServicePublication: vi.fn(),
}));

const pageId = "aa984ddf-ac15-43dc-a817-4559cfb37c4d";
const pagePath = "apps/landing/src/content/fishing/index.md";
const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId: "fishing",
    title: "Fishing licence",
    category: "business",
    formId: null,
    entryPoint: pageId,
    pages: [
      {
        id: pageId,
        path: pagePath,
        title: "Fishing licence",
        kind: "main",
        publicPath: "/business/fishing",
      },
    ],
  },
  pages: [
    {
      id: pageId,
      path: pagePath,
      frontmatter: { title: "Fishing licence", category: "business" },
      body: "Apply for a licence",
      baseSha: null,
    },
  ],
  recipe: null,
  pendingConfig: { mdaContactId: null, processors: null },
});
const form = (isPublished: boolean): BuilderFormSummary => ({
  id: "1",
  formId: "fishing",
  title: "Fishing licence",
  version: "1.0.0",
  isPublished,
});
const row = (f?: BuilderFormSummary): ServiceRow => ({
  key: "fishing",
  serviceId: "fishing",
  title: "Fishing licence",
  category: "business",
  subcategory: "",
  hasForm: !!f,
  formId: f?.formId ?? "",
  form: f,
  contentRoot: "fishing",
  searchText: "fishing",
  pages: [],
});
const workspace = (draft: ServiceDraft) =>
  ({ draft, setError: vi.fn() }) as unknown as ServiceState;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(getServiceUser).mockResolvedValue("editor");
});

it("deletes an unpublished service, its form and its browser copies after confirmation", async () => {
  const draft = await saveServiceDraft({
    data: { snapshot, expectedRevision: 0 },
  });
  localStorage.setItem(
    "service-workspace:v1:editor:fishing:versions",
    JSON.stringify([{ id: "v1" }]),
  );
  writeDraft(draftKeyFor(pagePath), {
    version: 2,
    revision: { source: "absent" },
    state: { title: "Fishing licence" },
  });
  const onDeleted = vi.fn();
  const onChanged = vi.fn();
  render(
    <ServiceDelete
      service={row(form(false))}
      workspace={workspace(draft)}
      onDeleted={onDeleted}
      onChanged={onChanged}
    />,
  );
  expect(screen.queryByRole("button", { name: "Disable service" })).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Delete service" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toContain(
    "Entry and start pages already on the website are not deleted",
  );
  await respondToConfirmation("Delete service");

  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(onDeleted).toHaveBeenCalled();
  expect(deleteForm).toHaveBeenCalledWith({ data: { formId: "fishing" } });
  expect(await listServiceDrafts()).toEqual([]);
  expect(
    await listServiceCheckpoints({ data: { serviceId: "fishing" } }),
  ).toEqual([]);
  expect(localStorage.getItem(draftKeyFor(pagePath))).toBeNull();
});

it("keeps the service when the author cancels", async () => {
  const draft = await saveServiceDraft({
    data: { snapshot, expectedRevision: 0 },
  });
  const onDeleted = vi.fn();
  render(
    <ServiceDelete
      service={row()}
      workspace={workspace(draft)}
      onDeleted={onDeleted}
      onChanged={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Delete service" }));
  await respondToConfirmation("Cancel");
  expect(onDeleted).not.toHaveBeenCalled();
  expect(deleteForm).not.toHaveBeenCalled();
  expect(await listServiceDrafts()).toHaveLength(1);
});

it("offers disable instead of delete for a published service", async () => {
  const draft = await saveServiceDraft({
    data: { snapshot, expectedRevision: 0 },
  });
  const onChanged = vi.fn();
  render(
    <ServiceDelete
      service={row(form(true))}
      workspace={workspace(draft)}
      onDeleted={vi.fn()}
      onChanged={onChanged}
    />,
  );
  expect(screen.queryByRole("button", { name: "Delete service" })).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Disable service" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(
    within(dialog).getByRole("textbox"),
    "Replaced by a new service",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: /Disable Form/ }),
  );

  await waitFor(() =>
    expect(disableForm).toHaveBeenCalledWith({
      data: { formId: "fishing", reason: "Replaced by a new service" },
    }),
  );
  expect(onChanged).toHaveBeenCalled();
  expect(deleteForm).not.toHaveBeenCalled();
});

it("blocks delete while the connected form's details are unavailable", async () => {
  const draft = await saveServiceDraft({
    data: {
      snapshot: {
        ...snapshot,
        manifest: { ...snapshot.manifest, formId: "fishing" },
      },
      expectedRevision: 0,
    },
  });
  localStorage.setItem(
    "service-workspace:v1:editor:fishing:versions",
    JSON.stringify([{ id: "v1" }]),
  );
  const ws = workspace(draft);
  const onDeleted = vi.fn();
  // The forms list failed to load: the manifest names a form, the row has none.
  render(
    <ServiceDelete
      service={row()}
      workspace={ws}
      onDeleted={onDeleted}
      onChanged={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Delete service" }));

  expect(ws.setError).toHaveBeenCalledWith(
    expect.stringContaining("application form could not be loaded"),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(deleteForm).not.toHaveBeenCalled();
  expect(onDeleted).not.toHaveBeenCalled();
  expect(await listServiceDrafts()).toHaveLength(1);
  expect(
    await listServiceCheckpoints({ data: { serviceId: "fishing" } }),
  ).toHaveLength(1);
});

it("treats a service whose manifest is already in Git as published", async () => {
  const draft = await saveServiceDraft({
    data: {
      snapshot: { ...snapshot, baseManifestSha: "a".repeat(40) },
      expectedRevision: 0,
    },
  });
  render(
    <ServiceDelete
      service={row()}
      workspace={workspace(draft)}
      onDeleted={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Delete service" })).toBeNull();
});
