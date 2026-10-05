import { expect, test } from "vitest";
import { formDraftKeys, ACTIVE_DRAFT_KEY } from "../../src/host/form-drafts";
import { govbbDraftKeys } from "../../src/host/govbb-draft";
import { serializedToNativeForm } from "../../src/forms/editor/native-bindings";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import {
  currentFormMode,
  newForm,
  newPage,
  openDocument,
  openWorkspace,
} from "../../src/workspace/documents";
import {
  documentKeys,
  WORKSPACE_KEY,
  WorkspaceRepository,
  type WorkspaceIndex,
} from "../../src/workspace/model";
import birth from "../fixtures/forms/v2/get-birth-certificate.json";

function memory(seed: Iterable<readonly [string, string]> = []) {
  const values = new Map(seed);
  const writes: string[] = [];
  let failKey: string | undefined;
  let beforeRead: ((key: string) => void) | undefined;

  const storage = {
    getItem: (key: string) => {
      beforeRead?.(key);

      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      writes.push(key);

      if (key === failKey) throw Error("Storage full");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  return {
    storage,
    values,
    writes,
    fail: (key: string) => {
      failKey = key;
    },
    read: (callback: (key: string) => void) => {
      beforeRead = callback;
    },
  };
}

function nativeSource() {
  return newForm("Ignored import title", "calculator", JSON.stringify(birth)).source;
}

test("bootstrap attaches active, previous, original and discovered drafts without rewriting any bytes", () => {
  const activeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const previousId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const discoveredId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const backupId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const active = formDraftKeys(activeId);
  const previous = formDraftKeys(previousId);
  const discovered = formDraftKeys(discoveredId);
  const backup = formDraftKeys(backupId);

  const h = memory([
    [ACTIVE_DRAFT_KEY, JSON.stringify({ version: 1, id: activeId, previous: previousId })],
    [active.committed, nativeSource()],
    [active.working, "Active unapplied source\n"],
    [previous.working, ""],
    [discovered.previous, "Malformed previous Markdown\n"],
    [backup.nativeMigrationBackup!, "Only original bytes remain\n"],
    [govbbDraftKeys.legacy, "{broken original JSON\n"],
  ]);

  const before = new Map(h.values);
  const opened = openWorkspace(h.storage, [...h.values.keys()]);
  expect(opened.initialLocation).toEqual({
    serviceId: `existing-${activeId}`,
    documentId: `form-${activeId}`,
  });
  expect(opened.repository.index.services).toHaveLength(5);
  expect(h.writes).toEqual([WORKSPACE_KEY]);

  for (const [key, source] of before) expect(h.values.get(key)).toBe(source);
  const native = opened.repository.index.services[0]?.documents[0];
  expect(native).toMatchObject({ kind: "form", mode: birth.mode, formId: birth.id, keys: active });

  const original = opened.repository.index.services.find(
    (service) => service.id === "existing-original",
  )?.documents[0];

  expect(original?.keys).toEqual(govbbDraftKeys);

  const backupDocument = opened.repository.index.services.find(
    (service) => service.id === `existing-${backupId}`,
  )?.documents[0];

  if (!backupDocument) throw Error("Backup draft was not attached");
  const recovery = openDocument(backupDocument, h.storage);
  expect(recovery.getSnapshot()).toMatchObject({
    status: "recovery",
    valid: false,
    source: "Only original bytes remain\n",
  });
  recovery.start();
  recovery.flush();
  expect(h.values.has(backup.committed)).toBe(false);
  expect(h.writes).toEqual([WORKSPACE_KEY]);
});

test("bootstrap index failure retains all existing draft records and the active pointer", () => {
  const h = memory([
    [ACTIVE_DRAFT_KEY, "{invalid pointer\n"],
    [govbbDraftKeys.legacy, "{invalid original\n"],
    [govbbDraftKeys.working, ""],
  ]);

  const before = new Map(h.values);
  h.fail(WORKSPACE_KEY);
  expect(() => openWorkspace(h.storage, [...h.values.keys()])).toThrow("Storage full");
  expect(h.values).toEqual(before);
  expect(h.writes).toEqual([WORKSPACE_KEY]);
});

test("bootstrap refuses to replace an index created by another tab during draft inspection", () => {
  const h = memory([[govbbDraftKeys.legacy, "{invalid original\n"]]);

  const remote = JSON.stringify({
    version: 1,
    services: [{ id: "other", title: "Other tab service", documents: [] }],
  });

  h.read((key) => {
    if (key === ACTIVE_DRAFT_KEY) h.values.set(WORKSPACE_KEY, remote);
  });
  expect(() => openWorkspace(h.storage)).toThrow("Another tab");
  expect(h.values.get(WORKSPACE_KEY)).toBe(remote);
  expect(h.values.get(govbbDraftKeys.legacy)).toBe("{invalid original\n");
  expect(h.writes).toEqual([]);
});

test("loading a saved workspace reads its observed bytes once and preserves invalid index evidence", () => {
  const initial: WorkspaceIndex = { version: 1, services: [] };
  const h = memory([[WORKSPACE_KEY, JSON.stringify(initial)]]);
  let reads = 0;
  h.read((key) => {
    if (key === WORKSPACE_KEY) reads++;
  });
  const opened = openWorkspace(h.storage);
  expect(opened.repository.index).toEqual(initial);
  expect(reads).toBe(1);
  expect(h.writes).toEqual([]);
  h.values.set(WORKSPACE_KEY, "{invalid index\n");
  expect(() => openWorkspace(h.storage)).toThrow();
  expect(h.values.get(WORKSPACE_KEY)).toBe("{invalid index\n");
  expect(h.writes).toEqual([]);
});

test("page documents preserve imported Markdown, existing form associations and independent drafts", () => {
  const source =
    "---\ntitle: Imported page\nform_id: existing-form\ncustom: retained\n---\n\n# Before you start\n\n[Continue](https://example.gov/start)\n";

  const entry = newPage("File name", "entry", source);
  const other = newPage("Other page", "supporting");
  const h = memory();
  const repository = new WorkspaceRepository(h.storage, { version: 1, services: [] });
  const service = repository.addService("Content-only service", entry.document, entry.source);
  repository.addDocument(service.id, other.document, other.source);
  expect(entry.source).toBe(source);
  expect(entry.document.id).not.toBe(other.document.id);
  expect(entry.document.keys).not.toEqual(other.document.keys);
  const store = openDocument(entry.document, h.storage);
  expect(store.getSnapshot()).toMatchObject({ mode: "visual", source, valid: true });
  expect(govbbPageCodec.encode(store.getSnapshot().state!)).toBe(source);
  store.edit(source.replace("Before you start", "Prepare your documents"));
  expect(store.apply()).toBe(true);
  expect(h.values.get(other.document.keys.committed)).toBe(other.source);
  expect(h.values.get(entry.document.keys.committed)).toContain("form_id: existing-form");
  expect(h.values.get(entry.document.keys.committed)).toContain("https://example.gov/start");
  expect(
    repository.index.services[0]?.documents.every((document) => document.kind === "page"),
  ).toBe(true);
});

test("source-only page documents can apply and reload without a visual editor", () => {
  const source = '---\ntitle: Specialist page\n---\n\n<specialist-component value="original" />\n';
  const created = newPage("Specialist page", "supporting", source);
  const h = memory([[created.document.keys.committed, created.source]]);
  const store = openDocument(created.document, h.storage);
  expect(store.getSnapshot()).toMatchObject({ mode: "source", valid: true, status: "saved" });
  expect(store.getSnapshot().recovery).toBeUndefined();
  expect(store.getSnapshot().state).toBeUndefined();
  const edited = source.replace("original", "edited");
  store.edit(edited);
  expect(store.apply()).toBe(true);
  expect(h.values.get(created.document.keys.committed)).toBe(edited);
  const reopened = openDocument(created.document, h.storage);
  expect(reopened.getSnapshot()).toMatchObject({ mode: "source", source: edited, valid: true });
  store.edit("---\ntitle: [broken\n---\n\nContent\n");
  expect(store.apply()).toBe(false);
  expect(h.values.get(created.document.keys.committed)).toBe(edited);
  expect(h.values.get(created.document.keys.working)).toContain("[broken");
});

test("new application forms and calculators use independent document namespaces and native modes", () => {
  const application = newForm("Application", "application");
  const calculator = newForm("Calculator", "calculator");
  expect(application.document.mode).toBe("application");
  expect(calculator.document.mode).toBe("calculator");
  expect(application.document.formId).not.toBe(calculator.document.formId);
  expect(application.document.keys).toEqual(documentKeys(application.document.id));

  const h = memory([
    [application.document.keys.committed, application.source],
    [calculator.document.keys.committed, calculator.source],
  ]);

  const applicationStore = openDocument(application.document, h.storage);
  const calculatorStore = openDocument(calculator.document, h.storage);
  expect(serializedToNativeForm(applicationStore.getSnapshot().state!, govbbFormEditor).mode).toBe(
    "application",
  );
  expect(serializedToNativeForm(calculatorStore.getSnapshot().state!, govbbFormEditor).mode).toBe(
    "calculator",
  );
  const imported = newForm("Ignored title", "calculator", JSON.stringify(birth));
  expect(imported.document).toMatchObject({
    title: birth.title,
    mode: birth.mode,
    formId: birth.id,
  });
  expect(imported.document.keys).not.toEqual(application.document.keys);
  expect(() => newForm("Invalid", "application", "{invalid JSON")).toThrow();
});

test("registry forms retain their own native mode and receive independent instances", () => {
  const entry = govbbFormEditor.registry.find((item) => item.scope === "form");

  if (!entry) throw Error("No complete registry form is installed");
  const first = newForm("Ignored title", "application", undefined, entry.key);
  const second = newForm("Ignored title", "application", undefined, entry.key);
  expect(first.document.formId).not.toBe(second.document.formId);
  expect(first.document.id).not.toBe(second.document.id);
  expect(first.document.keys).not.toEqual(second.document.keys);
  expect(() => newForm("Unavailable", "application", undefined, "missing-entry")).toThrow(
    "available form",
  );
});

test("form labels follow the applied mode without rewriting workspace references", () => {
  const original = newForm("Original title", "calculator");
  const imported = newForm("Ignored title", "calculator", JSON.stringify(birth));
  const h = memory([[original.document.keys.committed, original.source]]);
  const store = openDocument(original.document, h.storage);
  expect(currentFormMode(store.getSnapshot().state)).toBe("calculator");
  store.edit(imported.source);
  expect(currentFormMode(store.getSnapshot().state)).toBe("calculator");
  expect(store.apply()).toBe(true);
  expect(currentFormMode(store.getSnapshot().state)).toBe("application");
  expect(original.document.formId).not.toBe(birth.id);
  expect(h.writes).not.toContain(WORKSPACE_KEY);
  expect(currentFormMode(undefined)).toBeUndefined();
  expect(
    currentFormMode({
      root: { type: "root", version: 1, children: [], direction: null, format: "", indent: 0 },
    }),
  ).toBeUndefined();
});

test("unavailable browser storage opens form and page recovery without throwing during rendering", () => {
  const h = memory();

  const storage = {
    ...h.storage,
    getItem() {
      throw new Error("Browser storage unavailable");
    },
  };

  for (const document of [
    newForm("Form", "application").document,
    newPage("Page", "supporting").document,
  ]) {
    const store = openDocument(document, storage);
    expect(store.getSnapshot()).toMatchObject({ valid: false, status: "recovery" });
    expect(store.getSnapshot().error).toContain("Browser storage unavailable");
    store.start();
    expect(h.writes).toEqual([]);
  }
});
