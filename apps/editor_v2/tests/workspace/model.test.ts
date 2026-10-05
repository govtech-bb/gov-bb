import { expect, test } from "vitest";
import {
  documentKeys,
  documentLabel,
  locationHash,
  readLocation,
  WORKSPACE_KEY,
  WorkspaceRepository,
  type FormDocument,
  type PageDocument,
  type WorkspaceIndex,
} from "../../src/workspace/model";
import { parseWorkspace } from "../../src/workspace/validation";

const page = (id: string, role: PageDocument["role"] = "supporting"): PageDocument => ({
  id,
  kind: "page",
  title: id,
  role,
  keys: documentKeys(id),
});

const form = (id: string, mode: FormDocument["mode"] = "application"): FormDocument => ({
  id,
  kind: "form",
  title: id,
  mode,
  formId: `native-${id}`,
  keys: documentKeys(id),
});

const index = (): WorkspaceIndex => ({
  version: 1,
  services: [{ id: "service", title: "Existing service", documents: [page("entry", "entry")] }],
});

function memory(initial: WorkspaceIndex = index()) {
  const bytes = JSON.stringify(initial);

  const values = new Map([
    [WORKSPACE_KEY, bytes],
    [documentKeys("entry").committed, "Existing content"],
  ]);

  const writes: string[] = [];
  let failing: string | undefined;
  let onWrite: ((key: string) => void) | undefined;

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);

      if (key === failing) throw Error("Storage full");
      values.set(key, value);
      onWrite?.(key);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  return {
    bytes,
    values,
    writes,
    storage,
    repository: new WorkspaceRepository(storage, initial, bytes),
    fail: (key?: string) => {
      failing = key;
    },
    intercept: (next: (key: string) => void) => {
      onWrite = next;
    },
  };
}

test("index commit failure retains existing drafts and staged content without changing ownership", () => {
  const h = memory();
  const created = page("new-page");
  h.values.set(documentKeys("entry").working, "Unapplied original");
  h.fail(WORKSPACE_KEY);
  expect(() => h.repository.addDocument("service", created, "Exact new source\n")).toThrow(
    "Storage full",
  );
  expect(h.values.get(WORKSPACE_KEY)).toBe(h.bytes);
  expect(h.repository.index).toEqual(index());
  expect(h.values.get(documentKeys("entry").committed)).toBe("Existing content");
  expect(h.values.get(documentKeys("entry").working)).toBe("Unapplied original");
  expect(h.values.get(created.keys.committed)).toBe("Exact new source\n");
  h.fail();
  expect(() => h.repository.addDocument("service", created, "Replacement bytes")).toThrow(
    "already in use",
  );
  expect(h.values.get(created.keys.committed)).toBe("Exact new source\n");
});

test("staging failures never publish an index pointing at a missing document", () => {
  const h = memory();
  const created = page("new-page");
  h.fail(created.keys.committed);
  expect(() => h.repository.addService("New service", created, "New source")).toThrow(
    "Storage full",
  );
  expect(h.values.get(WORKSPACE_KEY)).toBe(h.bytes);
  expect(h.repository.index).toEqual(index());
  expect(h.writes).toEqual([created.keys.committed]);
});

test("stale workspace metadata rejects every change before staging a document", () => {
  const h = memory();
  const remote = JSON.stringify({ version: 1, services: [] });
  h.values.set(WORKSPACE_KEY, remote);
  expect(() => h.repository.addDocument("service", page("new-page"), "New")).toThrow("Another tab");
  expect(() => h.repository.addService("New service", page("new-entry", "entry"), "New")).toThrow(
    "Another tab",
  );
  expect(() => h.repository.renameService("service", "Renamed")).toThrow("Another tab");
  expect(h.writes).toEqual([]);
  expect(h.values.get(WORKSPACE_KEY)).toBe(remote);
});

test("a competing metadata commit during document staging wins and both drafts survive", () => {
  const h = memory();
  const created = page("new-page");
  const remote = JSON.stringify({ version: 1, services: [] });
  h.intercept((key) => {
    if (key === created.keys.committed) h.values.set(WORKSPACE_KEY, remote);
  });
  expect(() => h.repository.addDocument("service", created, "Staged source")).toThrow(
    "Another tab",
  );
  expect(h.values.get(WORKSPACE_KEY)).toBe(remote);
  expect(h.values.get(created.keys.committed)).toBe("Staged source");
  expect(h.values.get(documentKeys("entry").committed)).toBe("Existing content");
  expect(h.repository.index).toEqual(index());
});

test("new documents cannot reuse namespaces containing any working or recovery record", () => {
  for (const occupied of Object.values(documentKeys("occupied"))) {
    const h = memory();
    h.values.set(occupied, "Preserved bytes");
    expect(() => h.repository.addDocument("service", page("occupied"), "New")).toThrow(
      "already in use",
    );
    expect(h.values.get(occupied)).toBe("Preserved bytes");
    expect(h.writes).toEqual([]);
  }
});

test("duplicate identities and storage ownership are rejected before document writes", () => {
  const h = memory();
  expect(() => h.repository.addDocument("service", page("entry"), "New")).toThrow(
    "duplicate identity",
  );
  expect(() => h.repository.addDocument("service", page("service"), "New")).toThrow(
    "duplicate identity",
  );
  expect(() =>
    h.repository.addDocument(
      "service",
      { ...page("duplicate"), keys: documentKeys("entry") },
      "New",
    ),
  ).toThrow("same draft storage");
  expect(h.writes).toEqual([]);
});

test("services allow one entry, one start, supporting pages and one form or calculator", () => {
  const h = memory();
  h.repository.addDocument("service", page("start", "start"), "Start");
  h.repository.addDocument("service", page("help"), "Help");
  h.repository.addDocument("service", page("more-help"), "More help");
  h.repository.addDocument("service", form("calculator", "calculator"), "Calculator source");
  expect(h.repository.index.services[0]?.documents).toHaveLength(5);
  expect(() => h.repository.addDocument("service", page("entry-two", "entry"), "New")).toThrow(
    "entry page",
  );
  expect(() => h.repository.addDocument("service", page("start-two", "start"), "New")).toThrow(
    "start page",
  );
  expect(() => h.repository.addDocument("service", form("application"), "New")).toThrow(
    "already has a form or calculator",
  );
  expect(h.values.has(documentKeys("application").committed)).toBe(false);
  h.repository.renameService("service", "  New service name  ");
  expect(h.repository.index.services[0]?.title).toBe("New service name");
  expect(() => h.repository.renameService("missing", "Name")).toThrow("no longer available");
  expect(() => h.repository.renameService("service", "  ")).toThrow("Enter a service name");
});

test("workspace parsing rejects reserved, mixed, unknown and overlapping draft keys", () => {
  const original = page("entry", "entry");

  const malformed = [
    { ...original, keys: { ...original.keys, committed: WORKSPACE_KEY } },
    { ...original, keys: { ...original.keys, working: original.keys.committed } },
    { ...original, keys: { ...original.keys, working: documentKeys("other").working } },
    { ...original, keys: { ...original.keys, extra: "govbb-editor:active-draft" } },
    { ...original, role: "unknown" },
    { ...form("form"), formId: "" },
  ];

  for (const document of malformed)
    expect(() =>
      parseWorkspace(
        JSON.stringify({
          version: 1,
          services: [{ id: "service", title: "Service", documents: [document] }],
        }),
      ),
    ).toThrow();

  expect(() =>
    parseWorkspace(
      JSON.stringify({
        version: 1,
        services: [
          {
            id: "service",
            title: "Service",
            documents: [original, { ...page("copy"), keys: original.keys }],
          },
        ],
      }),
    ),
  ).toThrow("same draft storage");
  expect(() => parseWorkspace(JSON.stringify({ ...index(), version: 2 }))).toThrow();
});

test("document labels distinguish pages, applications and calculators without editing their titles", () => {
  expect(documentLabel(page("entry", "entry"))).toBe("Entry page");
  expect(documentLabel(page("start", "start"))).toBe("Start page");
  expect(documentLabel(page("Supporting information"))).toBe("Supporting information");
  expect(documentLabel(form("Form title"))).toBe("Application form");
  expect(documentLabel(form("Calculator title", "calculator"))).toBe("Calculator");
});

test("navigation hashes round trip encoded identities and ignore malformed locations", () => {
  const location = { serviceId: "service/with spaces", documentId: "document #é" };
  expect(readLocation(locationHash(location))).toEqual(location);
  expect(readLocation(locationHash(undefined))).toBeUndefined();
  expect(readLocation("#/services/%E0%A4%A")).toBeUndefined();
  expect(readLocation("#/services/a/b/extra")).toBeUndefined();
  expect(readLocation("#/other/a")).toBeUndefined();
});
