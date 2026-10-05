import type { SerializedEditorState } from "lexical";
import type { AnyFormDefinition } from "../forms/schema";
import { serializedToNativeForm } from "../forms/editor/native-bindings";
import { nativeState } from "../forms/editor/native-state";
import { createRegistryForm } from "../forms/editor/registry";
import { govbbFormCodec, govbbFormEditor } from "../presets/govbb-form";
import { govbbPageCodec } from "../presets/govbb-page";
import { createEmptyPage } from "../pages";
import { DraftStore, initialDraft } from "../persistence/draft-store";
import type { DraftKeys, DraftStorage } from "../persistence/types";
import { createGovbbDraft } from "../host/govbb-draft";
import { formDraftKeys, openFormDraft } from "../host/form-drafts";
import { prepareNativeImport } from "../host/native-form-io";
import { parseWorkspace } from "./validation";
import {
  documentKeys,
  WORKSPACE_KEY,
  WorkspaceRepository,
  type FormDocument,
  type PageDocument,
  type PageRole,
  type Service,
  type WorkspaceDocument,
} from "./model";

export function currentFormMode(
  state: SerializedEditorState | undefined,
): FormDocument["mode"] | undefined {
  const title = state?.root.children[0];

  if (title?.type !== "form-title") return;
  const mode = nativeState.parse(title.$?.native).form?.mode;

  return mode === "application" || mode === "calculator" ? mode : undefined;
}

function openFormDocument(storage: DraftStorage, keys: DraftKeys) {
  try {
    const backup = keys.nativeMigrationBackup ? storage.getItem(keys.nativeMigrationBackup) : null;

    const draftKeys = [
      keys.committed,
      keys.working,
      keys.previous,
      keys.legacy,
      keys.replacementJournal,
    ];

    if (
      backup !== null &&
      draftKeys.every((key) => key === undefined || storage.getItem(key) === null)
    )
      return new DraftStore(
        storage,
        {
          observed: null,
          working: null,
          needsSave: false,
          snapshot: {
            mode: "source",
            source: backup,
            committed: "",
            dirty: false,
            valid: false,
            status: "recovery",
            diagnostics: [],
            error:
              "Only the original draft backup remains. Download or repair it before editing this form.",
            recovery: { kind: "migration", original: backup },
          },
        },
        govbbFormCodec,
        keys,
      );
  } catch {
    return createGovbbDraft(storage, keys);
  }

  return createGovbbDraft(storage, keys);
}

export function openDocument(document: WorkspaceDocument, storage: DraftStorage) {
  if (document.kind === "form") return openFormDocument(storage, document.keys);

  return new DraftStore(
    storage,
    initialDraft(storage, () => createEmptyPage(document.title), govbbPageCodec, document.keys),
    govbbPageCodec,
    document.keys,
  );
}

export function newPage(title: string, role: PageRole, source?: string) {
  const id = crypto.randomUUID();
  const original = source ?? govbbPageCodec.encode(createEmptyPage(title));
  govbbPageCodec.prepare(original);
  const document: PageDocument = { id, title, kind: "page", role, keys: documentKeys(id) };

  return { document, source: original };
}

export function newForm(
  title: string,
  mode: "application" | "calculator",
  imported?: string,
  registryKey?: string,
) {
  const id = crypto.randomUUID();

  let form: AnyFormDefinition = {
    schemaVersion: 2,
    id,
    title,
    mode,
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [{ id: crypto.randomUUID(), type: "page", role: "questions", title: "" }],
  };

  if (registryKey) {
    const entry = govbbFormEditor.registry.find(
      (item) => item.key === registryKey && item.scope === "form",
    );

    if (!entry || entry.scope !== "form")
      throw new Error("Choose an available form from the registry");
    form = createRegistryForm(entry, govbbFormEditor);
  }

  const pending = prepareNativeImport(
    imported ?? JSON.stringify(form),
    govbbFormEditor,
    govbbFormCodec,
  );

  if (pending.status !== "ready" || !pending.prepared)
    throw new Error(
      pending.diagnostics.map((issue) => issue.message).join("; ") ||
        "The form could not be imported",
    );

  const native = serializedToNativeForm(pending.prepared.state, govbbFormEditor);

  const document: FormDocument = {
    id,
    title: native.title,
    kind: "form",
    mode: native.mode,
    formId: native.id,
    keys: documentKeys(id),
  };

  return { document, source: pending.prepared.source };
}

export function openWorkspace(storage: DraftStorage, existingKeys: readonly string[] = []) {
  const source = storage.getItem(WORKSPACE_KEY);

  if (source !== null)
    return { repository: new WorkspaceRepository(storage, parseWorkspace(source), source) };

  const active = openFormDraft(storage);
  const ids = new Set([active.id, "original"]);

  if (active.previous) ids.add(active.previous);

  for (const key of existingKeys) {
    const match =
      /^govbb-editor:forms:([a-f0-9-]{36}):(?:markdown|working|previous|legacy|native-original|replacement)$/.exec(
        key,
      );

    if (match) ids.add(match[1]!);
  }

  const services: Service[] = [];

  for (const id of ids) {
    const keys = formDraftKeys(id);

    if (
      id !== active.id &&
      id !== "original" &&
      !Object.values(keys).some((key) => key !== undefined && storage.getItem(key) !== null)
    )
      continue;
    const store = openFormDocument(storage, keys);
    let title = "Existing form";
    let mode: "application" | "calculator" = "application";
    let formId = id;

    try {
      if (store.initial.state) {
        const form = serializedToNativeForm(store.initial.state, govbbFormEditor);
        title = form.title.trim() || "Existing form";
        mode = form.mode;
        formId = form.id;
      }
    } catch {
      // Recovery still owns the original draft even when its native definition cannot be read.
    }

    services.push({
      id: `existing-${id}`,
      title,
      documents: [{ id: `form-${id}`, title, kind: "form", mode, formId, keys }],
    });
  }

  const repository = new WorkspaceRepository(storage, { version: 1, services }, source);
  repository.save(repository.index);

  return {
    repository,
    initialLocation: { serviceId: `existing-${active.id}`, documentId: `form-${active.id}` },
  };
}
