import {
  draftRecipeSchema,
  servicePendingConfigSchema,
  serviceDraftSchema,
  serviceSnapshotSchema,
  serviceReadiness,
  type ServiceDraft,
  type ServiceSnapshot,
  type ServiceCheckpoint,
} from "@govtech-bb/form-types";
import { getRecipe, getFormConfig } from "../server/forms";
import {
  getServiceUser,
  loadServiceSource,
  saveServiceRecipe,
  getFormSourceSha,
  retainServiceVersion,
  publishServiceVersion,
  getServicePublication as getPublication,
} from "../server/services";
import { contentSlug, startPageUrl } from "./content";

// Service organisation and content follow the existing browser-draft model.
// Form saves still use the existing API and its editing claim.
const prefix = "service-workspace:v1:";
async function scope() {
  return `${prefix}${encodeURIComponent(await getServiceUser())}:`;
}
function read(key: string): ServiceDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const result = serviceDraftSchema.safeParse(JSON.parse(raw));
  if (!result.success)
    throw new Error(
      "This saved service draft could not be read. Your stored copy has been retained.",
    );
  return result.data;
}
function store(key: string, draft: ServiceDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    throw new Error(
      "This browser could not save the service draft. Free some storage and try again; keep this page open.",
    );
  }
  window.dispatchEvent(new Event("service-draft-saved"));
}
async function localDrafts() {
  if (
    typeof localStorage === "undefined" ||
    !Object.keys(localStorage).some((key) => key.startsWith(prefix))
  )
    return [];
  const start = await scope();
  return Object.keys(localStorage)
    .filter(
      (key) => key.startsWith(start) && !key.slice(start.length).includes(":"),
    )
    .map((key) => read(key))
    .filter((draft): draft is ServiceDraft => !!draft);
}
export async function listServiceDrafts() {
  return (await localDrafts()).map((draft) => ({
    ...draft,
    ready: serviceReadiness(draft).ready,
    publishedRevision: null,
  }));
}
export async function getServiceOwner({
  data,
}: {
  data: { formId?: string; path?: string };
}) {
  const draft = (await localDrafts()).find((d) =>
    data.formId
      ? d.manifest.formId === data.formId
      : d.pages.some((p) => p.path === data.path),
  );
  return { serviceId: draft?.manifest.serviceId ?? null };
}
export async function getServiceDraft({
  data,
}: {
  data: { serviceId: string };
}): Promise<ServiceDraft> {
  const key = `${await scope()}${data.serviceId}`;
  let draft = read(key);
  if (!draft) {
    const source = await loadServiceSource({ data });
    draft = {
      ...source,
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: await getServiceUser(),
    };
    store(key, draft);
  }
  const formId = draft.recipe?.formId ?? draft.manifest.formId;
  if (formId) {
    let loaded: [unknown, unknown] | null = null;
    try {
      loaded = await Promise.all([
        getRecipe({ data: { formId } }),
        getFormConfig({ data: { formId } }),
      ]);
    } catch {
      // Forms API unavailable: keep the stored draft; readiness reports a
      // missing form and the next load retries.
    }
    if (loaded) {
      // A slow refresh must not overwrite content saved by another screen or tab.
      const latest = read(key);
      if (latest && latest.revision !== draft.revision) return latest;
      const recipe = draftRecipeSchema.parse(loaded[0]);
      const pendingConfig = servicePendingConfigSchema.parse(loaded[1]);
      if (
        JSON.stringify(recipe) !== JSON.stringify(draft.recipe) ||
        JSON.stringify(pendingConfig) !== JSON.stringify(draft.pendingConfig)
      ) {
        draft = {
          ...draft,
          recipe,
          pendingConfig,
          revision: draft.revision + 1,
        };
        store(key, draft);
      }
    }
  }
  return draft;
}
export async function adoptService({
  data,
}: Parameters<typeof loadServiceSource>[0]): Promise<ServiceDraft> {
  const key = `${await scope()}${data.serviceId}`;
  if (read(key))
    return getServiceDraft({ data: { serviceId: data.serviceId } });
  const snapshot = await loadServiceSource({ data });
  const draft = {
    ...snapshot,
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: await getServiceUser(),
  };
  store(key, draft);
  return draft;
}

async function save(
  snapshotInput: ServiceSnapshot,
  expectedRevision: number,
  saveRecipe: boolean,
): Promise<ServiceDraft> {
  const snapshot = serviceSnapshotSchema.parse(snapshotInput);
  const owner = await getServiceUser();
  const key = `${prefix}${encodeURIComponent(owner)}:${snapshot.manifest.serviceId}`;
  const write = async () => {
    const current = read(key);
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new Error(
        "Another tab saved this service draft. Reload and compare before saving again.",
      );
    if (
      current?.manifest.formId &&
      current.manifest.formId !== snapshot.manifest.formId
    )
      throw new Error(
        "Each service has one application. Keep the existing form identity.",
      );
    for (const other of await localDrafts()) {
      if (other.manifest.serviceId === snapshot.manifest.serviceId) continue;
      if (
        (snapshot.manifest.formId &&
          other.manifest.formId === snapshot.manifest.formId) ||
        other.pages.some((p) =>
          snapshot.pages.some((next) => next.path === p.path),
        )
      )
        throw new Error(
          "That page or application already belongs to another service. Open that service to edit it.",
        );
    }
    if (
      current?.pages.some(
        (p) =>
          p.baseSha && !snapshot.pages.some((next) => next.path === p.path),
      )
    )
      throw new Error(
        "Keep published URLs when restoring a draft. Retire a page through a reviewed Git change.",
      );
    if (snapshot.recipe && snapshot.manifest.contactDetails)
      snapshot.recipe = {
        ...snapshot.recipe,
        contactDetails: snapshot.manifest.contactDetails,
      };
    if (
      snapshot.recipe &&
      saveRecipe &&
      (JSON.stringify(snapshot.recipe) !== JSON.stringify(current?.recipe) ||
        JSON.stringify(snapshot.pendingConfig) !==
          JSON.stringify(current?.pendingConfig))
    ) {
      await saveServiceRecipe({
        data: {
          recipe: snapshot.recipe,
          expectedRecipe: current?.recipe ?? null,
          pendingConfig: snapshot.pendingConfig,
        },
      });
    }
    const draft = {
      ...snapshot,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: owner,
    };
    store(key, draft);
    return draft;
  };
  return navigator.locks ? navigator.locks.request(key, write) : write();
}
export const saveServiceDraft = ({
  data,
}: {
  data: { snapshot: ServiceSnapshot; expectedRevision: number };
}) => save(data.snapshot, data.expectedRevision, true);
export async function saveServicePage({
  data,
}: {
  data: {
    serviceId: string;
    expectedRevision: number;
    page: ServiceSnapshot["pages"][number];
  };
}) {
  const current = await getServiceDraft({ data });
  const previous = current.pages.find(
    (p) => p.id === data.page.id && p.path === data.page.path,
  );
  const meta = current.manifest.pages.find((p) => p.id === data.page.id);
  if (!previous || !meta)
    throw new Error("This page does not belong to the selected service");
  const publicPath = new URL(
    startPageUrl(
      String(data.page.frontmatter.category ?? ""),
      contentSlug(data.page.path),
      String(data.page.frontmatter.subcategory ?? ""),
    ),
    "https://service.invalid",
  ).pathname;
  if (publicPath !== meta.publicPath)
    throw new Error(
      "Changing the category changes this page's public link. Create a separate page for a different link.",
    );
  return save(
    {
      ...current,
      pages: current.pages.map((p) =>
        p.id === previous.id ? { ...data.page, baseSha: previous.baseSha } : p,
      ),
      manifest: {
        ...current.manifest,
        pages: current.manifest.pages.map((p) =>
          p.id === meta.id
            ? { ...p, title: String(data.page.frontmatter.title ?? p.title) }
            : p,
        ),
      },
    },
    data.expectedRevision,
    false,
  );
}
export async function saveServiceForm({
  data,
}: {
  data: {
    serviceId: string;
    expectedRevision: number;
    recipe: NonNullable<ServiceSnapshot["recipe"]>;
    pendingConfig: ServiceSnapshot["pendingConfig"];
  };
}) {
  const current = await getServiceDraft({ data });
  const baseRecipeSha = current.manifest.formId
    ? current.baseRecipeSha
    : await getFormSourceSha({ data: { formId: data.recipe.formId } });
  if (!current.manifest.formId && baseRecipeSha)
    throw new Error(
      "That application exists already. Connect it from the service workspace.",
    );
  return save(
    {
      ...current,
      recipe: data.recipe,
      pendingConfig: data.pendingConfig,
      baseRecipeSha,
      manifest: { ...current.manifest, formId: data.recipe.formId },
    },
    data.expectedRevision,
    true,
  );
}
export async function attachServiceForm({
  data,
}: {
  data: { serviceId: string; expectedRevision: number; formId: string };
}) {
  const current = await getServiceDraft({ data });
  if (current.manifest.formId)
    throw new Error("This service already has an application");
  const [recipe, pendingConfig, baseRecipeSha] = await Promise.all([
    getRecipe({ data }),
    getFormConfig({ data }),
    getFormSourceSha({ data }),
  ]);
  return save(
    {
      ...current,
      recipe,
      pendingConfig,
      baseRecipeSha,
      manifest: {
        ...current.manifest,
        formId: data.formId,
        contactDetails:
          current.manifest.contactDetails ?? recipe.contactDetails,
      },
    },
    data.expectedRevision,
    false,
  );
}

export type SavedVersion = ServiceCheckpoint & { snapshot: ServiceSnapshot };
async function versionsKey(serviceId: string) {
  return `${await scope()}${serviceId}:versions`;
}
export async function listServiceCheckpoints({
  data,
}: {
  data: { serviceId: string };
}): Promise<SavedVersion[]> {
  return JSON.parse(
    localStorage.getItem(await versionsKey(data.serviceId)) || "[]",
  );
}
async function remember(version: SavedVersion) {
  const versions = await listServiceCheckpoints({ data: version });
  // ponytail: keep 30 browser shortcuts; Git tags retain every named version.
  localStorage.setItem(
    await versionsKey(version.serviceId),
    JSON.stringify(
      [version, ...versions.filter((v) => v.id !== version.id)].slice(0, 30),
    ),
  );
  return version;
}
export async function getServiceCheckpoint({
  data,
}: {
  data: { serviceId: string; id: string };
}) {
  const found = (await listServiceCheckpoints({ data })).find(
    (v) => v.id === data.id,
  );
  if (!found)
    throw new Error(
      "This version is not available in this browser. Earlier Git changes remain available below.",
    );
  return found;
}
export async function createServiceCheckpoint({
  data,
}: {
  data: { serviceId: string; expectedRevision: number; label: string };
}) {
  const snapshot = await getServiceDraft({ data });
  if (snapshot.revision !== data.expectedRevision)
    throw new Error("Reload the service before saving a version");
  const version = await remember({
    id: crypto.randomUUID(),
    serviceId: data.serviceId,
    revision: snapshot.revision,
    label: data.label,
    createdAt: new Date().toISOString(),
    createdBy: await getServiceUser(),
    gitSha: null,
    gitRef: null,
    prNumber: null,
    prUrl: null,
    snapshot,
  });
  return retryServiceCheckpoint({ data: version });
}
export async function retryServiceCheckpoint({
  data,
}: {
  data: { serviceId: string; id: string };
}) {
  const version = await getServiceCheckpoint({ data });
  const retained = await retainServiceVersion({ data: version });
  return remember({ ...version, ...retained });
}
export async function restoreServiceCheckpoint({
  data,
}: {
  data: { serviceId: string; id: string; expectedRevision: number };
}) {
  const current = await getServiceDraft({ data });
  const target = await getServiceCheckpoint({ data });
  if (current.revision !== data.expectedRevision)
    throw new Error("Reload before restoring this version");
  await remember({
    id: crypto.randomUUID(),
    serviceId: data.serviceId,
    revision: current.revision,
    label: "Before restoring a version",
    createdAt: new Date().toISOString(),
    createdBy: current.updatedBy,
    gitSha: null,
    gitRef: null,
    prNumber: null,
    prUrl: null,
    snapshot: current,
  });
  return save(
    {
      ...target.snapshot,
      pendingConfig: current.pendingConfig,
      baseRecipeSha: current.baseRecipeSha,
      baseManifestSha: current.baseManifestSha,
      pages: target.snapshot.pages.map((p) => ({
        ...p,
        baseSha: (current.pages.find((next) => next.path === p.path) ?? p)
          .baseSha,
      })),
    },
    data.expectedRevision,
    true,
  );
}
export async function publishServiceCheckpoint({
  data,
}: {
  data: { serviceId: string; id: string };
}) {
  const version = await getServiceCheckpoint({ data });
  if (version.prNumber && version.prUrl)
    return { prNumber: version.prNumber, prUrl: version.prUrl };
  const result = await publishServiceVersion({ data: version });
  await remember({ ...version, ...result });
  return result;
}
export async function getServicePublication({
  data,
}: {
  data: { serviceId: string; id: string };
}) {
  const version = await getServiceCheckpoint({ data });
  if (!version.prNumber) return { state: "draft" };
  return getPublication({ data: { prNumber: version.prNumber } });
}
