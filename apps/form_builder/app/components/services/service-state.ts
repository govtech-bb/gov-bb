import { useCallback, useEffect, useState } from "react";
import type {
  ServiceDraft,
  ServiceManifest,
  ServiceSnapshot,
} from "@govtech-bb/form-types";
import {
  adoptService,
  getServiceDraft,
  listServiceDrafts,
  saveServiceDraft,
} from "../../lib/service-drafts";
import type { ServiceRow } from "./service-model";

export type ServiceIndexEntry = Pick<
  ServiceDraft,
  "manifest" | "revision" | "updatedAt" | "updatedBy"
> & { ready: boolean; publishedRevision: number | null };
export const serviceTabs = [
  ["overview", "Overview"],
  ["pages", "Pages"],
  ["form", "Application form"],
  ["journey", "Journey map"],
  ["delivery", "After submission"],
  ["publish", "Publish"],
  ["details", "Details"],
] as const;
export type ServiceTab = (typeof serviceTabs)[number][0];

export function useServiceIndex() {
  const [entries, setEntries] = useState<ServiceIndexEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setEntries(await listServiceDrafts());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Service drafts are unavailable",
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener("service-draft-saved", refresh);
    return () => window.removeEventListener("service-draft-saved", refresh);
  }, [refresh]);
  return { entries, error, refresh };
}

export function mergeServiceRows(
  rows: ServiceRow[],
  entries: ServiceIndexEntry[],
): ServiceRow[] {
  const ownedForms = new Set(
    entries.map((e) => e.manifest.formId).filter(Boolean),
  );
  const ownedPages = new Set(
    entries.flatMap((e) => e.manifest.pages.map((p) => p.path)),
  );
  const remaining = rows.flatMap((r) => {
    const pages = r.pages.filter((p) => !ownedPages.has(p.path));
    if (!ownedForms.has(r.formId) && pages.length === r.pages.length)
      return [r];
    return pages.length
      ? [
          {
            ...r,
            key: `page:${pages[0].path}`,
            pages,
            formId: "",
            form: undefined,
            hasForm: false,
          },
        ]
      : [];
  });
  return [
    ...remaining,
    ...entries.map((entry) => {
      const m = entry.manifest;
      const existing =
        rows.find((r) => m.formId && r.formId === m.formId) ??
        rows.find((r) =>
          r.pages.some((p) => m.pages.some((mp) => mp.path === p.path)),
        );
      return {
        key: m.serviceId,
        serviceId: m.serviceId,
        title: m.title,
        category: m.category,
        subcategory: m.subcategory,
        hasForm: !!m.formId,
        formId: m.formId ?? "",
        form: existing?.form,
        contentRoot: existing?.contentRoot ?? m.serviceId,
        searchText:
          `${m.title} ${m.description} ${m.category} ${m.formId ?? ""}`.toLowerCase(),
        pages: m.pages.map((p) => ({
          path: p.path,
          title: p.title,
          kind: p.kind,
          category: m.category,
          subcategory: m.subcategory,
          formId: m.formId ?? "",
          visibility:
            existing?.pages.find((ep) => ep.path === p.path)?.visibility ??
            "draft",
          isLocalDraft: false,
          hasFormButton:
            existing?.pages.find((ep) => ep.path === p.path)?.hasFormButton ??
            false,
        })),
        updatedAt: entry.updatedAt,
        revision: entry.revision,
        setupComplete: entry.ready,
        publishedRevision: entry.publishedRevision,
      } satisfies ServiceRow;
    }),
  ].sort((a, b) => a.title.localeCompare(b.title));
}

export function useServiceState(service: ServiceRow) {
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = service.serviceId
        ? await getServiceDraft({ data: { serviceId: service.serviceId } })
        : await adoptService({
            data: {
              serviceId: (
                service.formId || service.contentRoot.replaceAll("/", "-")
              ).slice(0, 100),
              title: service.title,
              category: service.category,
              subcategory: service.subcategory,
              formId: service.formId || null,
              paths: service.pages
                .filter((p) => !p.isLocalDraft)
                .map((p) => p.path),
            },
          });
      setDraft(result);
      setError(null);
      if (!service.serviceId)
        window.dispatchEvent(new Event("service-draft-saved"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The service draft could not be loaded",
      );
    }
  }, [service.key]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const save = async (
    snapshot: ServiceSnapshot,
  ): Promise<ServiceDraft | null> => {
    if (!draft || saving) return null;
    setSaving(true);
    setError(null);
    try {
      const result = await saveServiceDraft({
        data: { expectedRevision: draft.revision, snapshot },
      });
      setDraft(result);
      window.dispatchEvent(new Event("service-draft-saved"));
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The service draft could not be saved",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { draft, setDraft, error, setError, saving, save, refresh };
}
export type ServiceState = ReturnType<typeof useServiceState>;

export function emptyService(title: string): ServiceSnapshot {
  const manifest: ServiceManifest = {
    schemaVersion: 1,
    visibility: "draft",
    serviceId: serviceIdFor(title) || `service-${crypto.randomUUID()}`,
    title,
    description: "",
    category: "",
    subcategory: "",
    formId: null,
    pages: [],
    entryPoint: null,
    setup: {
      step: "about",
      delivery: "undecided",
      applicantEmail: "undecided",
    },
  };
  return {
    manifest,
    pages: [],
    recipe: null,
    baseRecipeSha: null,
    baseManifestSha: null,
    pendingConfig: { mdaContactId: null, processors: null },
  };
}

export function serviceIdFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}
