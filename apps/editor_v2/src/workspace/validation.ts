import type { DraftKeys } from "../persistence/types";
import { govbbDraftKeys } from "../host/govbb-draft";
import type { WorkspaceIndex, WorkspaceDocument, Service } from "./model";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function keys(value: unknown): value is DraftKeys {
  if (!object(value) || typeof value.committed !== "string") return false;
  const match = /^(govbb-editor:(documents|forms):[^:]+):markdown$/.exec(value.committed);

  const expected: DraftKeys | undefined =
    value.committed === govbbDraftKeys.committed
      ? govbbDraftKeys
      : match
        ? {
            committed: value.committed,
            working: `${match[1]}:working`,
            previous: `${match[1]}:previous`,
            legacy: `${match[1]}:legacy`,
            nativeMigrationBackup: `${match[1]}:${match[2] === "forms" ? "native-original" : "original"}`,
            replacementJournal: `${match[1]}:replacement`,
          }
        : undefined;

  if (!expected || Object.keys(value).some((key) => !Object.hasOwn(expected, key))) return false;

  return (
    (["committed", "working", "previous", "legacy"] as const).every(
      (key) => value[key] === expected[key],
    ) &&
    (["nativeMigrationBackup", "replacementJournal"] as const).every(
      (key) => value[key] === undefined || value[key] === expected[key],
    )
  );
}

function document(value: unknown): value is WorkspaceDocument {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.title !== "string" ||
    !keys(value.keys)
  )
    return false;

  return value.kind === "page"
    ? value.role === "entry" || value.role === "start" || value.role === "supporting"
    : value.kind === "form" &&
        (value.mode === "application" || value.mode === "calculator") &&
        typeof value.formId === "string" &&
        !!value.formId;
}

function service(value: unknown): value is Service {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.title !== "string" ||
    !value.title.trim()
  )
    return false;
  const documents = value.documents;

  if (!Array.isArray(documents) || !documents.every(document)) return false;

  return (
    documents.filter((item) => item.kind === "form").length <= 1 &&
    ["entry", "start"].every(
      (role) => documents.filter((item) => item.kind === "page" && item.role === role).length <= 1,
    )
  );
}

export function parseWorkspace(source: string): WorkspaceIndex {
  const value: unknown = JSON.parse(source);

  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.services) ||
    !value.services.every(service)
  )
    throw new Error(
      "The saved service list could not be opened. Download it before replacing or repairing it.",
    );

  const ids = new Set<string>();
  const ownedKeys = new Set<string>();

  for (const service of value.services) {
    if (ids.has(service.id))
      throw new Error("The saved service list contains a duplicate identity");
    ids.add(service.id);

    for (const document of service.documents) {
      if (ids.has(document.id))
        throw new Error("The saved service list contains a duplicate identity");
      ids.add(document.id);

      for (const key of Object.values(document.keys)) {
        if (key === undefined) continue;

        if (ownedKeys.has(key)) throw new Error("Two documents share the same draft storage");
        ownedKeys.add(key);
      }
    }
  }

  return { version: 1, services: value.services };
}
