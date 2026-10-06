import type { DraftKeys, DraftStorage } from "../persistence/types";
import type { DraftStore } from "../persistence/draft-store";
import { parseWorkspace } from "./validation";

export type PageRole = "entry" | "start" | "supporting";

type DocumentBase = { id: string; title: string; keys: DraftKeys };

export type PageDocument = DocumentBase & { kind: "page"; role: PageRole };

export type FormDocument = DocumentBase & {
  kind: "form";
  mode: "application" | "calculator";
  formId: string;
};

export type WorkspaceDocument = PageDocument | FormDocument;

export type Service = { id: string; title: string; documents: WorkspaceDocument[] };

export type WorkspaceIndex = { version: 1; services: Service[] };

export type WorkspaceLocation = { serviceId: string; documentId?: string } | undefined;

export const WORKSPACE_KEY = "govbb-editor:workspace:v1";

export function documentKeys(id: string): DraftKeys {
  const prefix = `govbb-editor:documents:${id}`;

  return {
    committed: `${prefix}:markdown`,
    working: `${prefix}:working`,
    previous: `${prefix}:previous`,
    legacy: `${prefix}:legacy`,
    nativeMigrationBackup: `${prefix}:original`,
    replacementJournal: `${prefix}:replacement`,
  };
}

export function documentLabel(document: WorkspaceDocument) {
  if (document.kind === "form")
    return document.mode === "calculator" ? "Calculator" : "Application form";

  return document.role === "entry"
    ? "Entry page"
    : document.role === "start"
      ? "Start page"
      : document.title || "Untitled page";
}

export function locationHash(location: WorkspaceLocation) {
  if (!location) return "#/services";

  return `#/services/${encodeURIComponent(location.serviceId)}${location.documentId ? `/${encodeURIComponent(location.documentId)}` : ""}`;
}

export function readLocation(hash: string): WorkspaceLocation {
  const parts = hash.split("/");

  if (parts[0] !== "#" || parts[1] !== "services" || !parts[2] || parts.length > 4) return;

  try {
    return {
      serviceId: decodeURIComponent(parts[2]),
      ...(parts[3] && { documentId: decodeURIComponent(parts[3]) }),
    };
  } catch {
    return;
  }
}

export function flushDocument(store?: DraftStore) {
  if (!store) return;
  store.flush();
  const snapshot = store.getSnapshot();

  if (snapshot.status === "error" || snapshot.status === "saving")
    throw new Error("Save or download this draft before leaving it. Then try again.");

  if (snapshot.conflict || snapshot.replacement)
    throw new Error("Resolve this draft's conflict or interrupted import before leaving it.");
}

export class WorkspaceRepository {
  private observed: string | null;
  private value: WorkspaceIndex;

  constructor(
    readonly storage: DraftStorage,
    initial: WorkspaceIndex,
    observed: string | null = storage.getItem(WORKSPACE_KEY),
  ) {
    this.observed = observed;
    this.value = parseWorkspace(JSON.stringify(initial));
  }

  get index() {
    return this.value;
  }

  private assertCurrent() {
    if (this.storage.getItem(WORKSPACE_KEY) !== this.observed)
      throw new Error("Another tab changed the service list. Reload before changing it.");
  }

  save(index: WorkspaceIndex) {
    const source = JSON.stringify(index);
    const parsed = parseWorkspace(source);
    this.assertCurrent();
    this.storage.setItem(WORKSPACE_KEY, source);
    this.observed = source;
    this.value = parsed;
  }

  addService(title: string, page: PageDocument, source: string) {
    const name = title.trim();

    if (!name) throw new Error("Enter a service name");
    const service: Service = { id: crypto.randomUUID(), title: name, documents: [page] };
    this.addPreparedDocument(
      { version: 1, services: [...this.value.services, service] },
      page,
      source,
    );

    return service;
  }

  renameService(id: string, title: string) {
    const name = title.trim();

    if (!name) throw new Error("Enter a service name");

    if (!this.value.services.some((service) => service.id === id))
      throw new Error("This service is no longer available. Reload the service list.");
    this.save({
      version: 1,
      services: this.value.services.map((service) =>
        service.id === id ? { ...service, title: name } : service,
      ),
    });
  }

  addDocument(serviceId: string, document: WorkspaceDocument, source: string) {
    const service = this.value.services.find((item) => item.id === serviceId);

    if (!service) throw new Error("This service is no longer available. Reload the service list.");

    if (document.kind === "form" && service.documents.some((item) => item.kind === "form"))
      throw new Error(
        "This service already has a form or calculator. Create another service to keep both.",
      );

    if (
      document.kind === "page" &&
      document.role !== "supporting" &&
      service.documents.some((item) => item.kind === "page" && item.role === document.role)
    )
      throw new Error(
        `This service already has an ${document.role === "entry" ? "entry" : "start"} page. Open it to import replacement content.`,
      );

    this.addPreparedDocument(
      {
        version: 1,
        services: this.value.services.map((item) =>
          item.id === serviceId ? { ...item, documents: [...item.documents, document] } : item,
        ),
      },
      document,
      source,
    );
  }

  private addPreparedDocument(index: WorkspaceIndex, document: WorkspaceDocument, source: string) {
    parseWorkspace(JSON.stringify(index));
    this.assertCurrent();
    this.writeNewDocument(document, source);
    this.save(index);
  }

  private writeNewDocument(document: WorkspaceDocument, source: string) {
    if (
      Object.values(document.keys).some(
        (key) => key !== undefined && this.storage.getItem(key) !== null,
      )
    )
      throw new Error("This draft identity is already in use. Try creating the document again.");

    this.storage.setItem(document.keys.committed, source);
  }
}
