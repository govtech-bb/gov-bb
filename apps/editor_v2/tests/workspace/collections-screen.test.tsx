/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEditorApi, type CollectionRecord } from "../../src/api/client";
import { CollectionScreen, CollectionsScreen } from "../../src/workspace/collections";
import { Toaster } from "../../src/ui/toast";

const FIELDS = [
  { key: "name", label: "Name", type: "text" },
  { key: "key", label: "Key", type: "slug" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Telephone", type: "text" },
] as const;

const COLLECTION = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: { fields: [...FIELDS] },
  schema_version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

const stamp = (version: number) => new Date(Date.UTC(2026, 9, 26, 12, 0, 0, version)).toISOString();

/** A refusal's body: api_v2's own, or Fastify's for a request it couldn't read. */
type Refusal = {
  error: string;
  message: string;
  errors?: { field: string; message: string }[];
  statusCode?: number;
};

type Write = { method: string; path: string; body: unknown; ifUpdatedAt: string | null };

/**
 * api_v2's collection routes over one in-memory collection, checked as api_v2 checks them: versions, record keys and
 * each field's type. `refuse` answers the next write with a status and body of the test's choosing.
 */
function contentApi() {
  let clock = 1;

  let records: CollectionRecord[] = [
    {
      record_key: "barbados-drug-service",
      data: {
        key: "barbados-drug-service",
        name: "Barbados Drug Service",
        phone: "(246) 535-4300",
        email: "management@drugservice.gov.bb",
      },
      updated_at: stamp(0),
    },
    {
      record_key: "nis",
      data: { key: "nis", name: "National Insurance" },
      updated_at: stamp(0),
    },
  ];

  const writes: Write[] = [];
  let refusal: { status: number; body: Refusal } | undefined;

  const json: typeof Response.json = (body, init) => Response.json(body, init);

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = decodeURI(new URL(input instanceof Request ? input.url : input).pathname);
    const method = init?.method ?? "GET";

    if (path === "/collections")
      return json({ collections: [{ ...COLLECTION, record_count: records.length }] });

    if (path === "/collections/missing/records")
      return json({ error: "not_found", message: "No collection missing." }, { status: 404 });

    if (path === "/collections/contacts/records") return json({ collection: COLLECTION, records });

    const recordKey = path.replace("/collections/contacts/records/", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const ifUpdatedAt = new Headers(init?.headers).get("if-updated-at");

    writes.push({ method, path, body, ifUpdatedAt });

    if (refusal) {
      const { status, body: answer } = refusal;

      refusal = undefined;

      return json(answer, { status });
    }

    const target = records.find((record) => record.record_key === recordKey);

    if (method === "POST" && target)
      return json({ error: "record_exists", message: "Taken." }, { status: 409 });

    if (method !== "POST" && !target)
      return json({ error: "not_found", message: "Gone." }, { status: 404 });

    if (target && ifUpdatedAt && target.updated_at !== ifUpdatedAt)
      return json({ error: "conflict", message: "Changed." }, { status: 409 });

    if (method === "DELETE") {
      records = records.filter((record) => record !== target);

      return new Response(null, { status: 204 });
    }

    const saved = {
      record_key: recordKey,
      data: { ...body.data, key: recordKey },
      updated_at: stamp(clock++),
    };

    records = [...records.filter((record) => record !== target), saved].toSorted((a, b) =>
      a.record_key.localeCompare(b.record_key),
    );

    return json(saved, { status: method === "POST" ? 201 : 200 });
  });

  return {
    fetch,
    writes,
    refuse: (status: number, body: Refusal) => void (refusal = { status, body }),
    /** Someone else's save, made straight in the content API. */
    change: (recordKey: string, data: CollectionRecord["data"]) => {
      records = records.map((record) =>
        record.record_key === recordKey
          ? {
              ...record,
              data: { ...record.data, ...data },
              updated_at: stamp(clock++),
            }
          : record,
      );
    },
    remove: (recordKey: string) =>
      void (records = records.filter((record) => record.record_key !== recordKey)),
  };
}

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/collections" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/collections/$key" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/collections"] }),
});

let host: HTMLDivElement;

let root: Root;

let client: QueryClient;

let server: ReturnType<typeof contentApi>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server = contentApi();
  vi.stubGlobal("fetch", server.fetch);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
});

const api = () => createEditorApi("https://api.example.test");

const mount = (screen: ReactNode) =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          {screen}
          <Toaster />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  );

/** A collection's screen, keeping `record` as the address would; the screen's asks to change it land in `asked`. */
function renderCollection(options: { record?: string; readOnly?: boolean; key?: string } = {}) {
  const asked: (string | undefined)[] = [];
  const editorApi = api();

  function Harness() {
    const [record, setRecord] = useState(options.record);

    return (
      <CollectionScreen
        api={editorApi}
        collectionKey={options.key ?? "contacts"}
        record={record}
        onRecord={(next) => {
          asked.push(next);
          setRecord(next);
        }}
        readOnly={options.readOnly}
      />
    );
  }

  return { asked, ready: mount(<Harness />) };
}

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const rows = () => [...host.querySelectorAll("tbody tr")];

const cells = (row: Element) => [...row.querySelectorAll("td")].map((cell) => cell.textContent);

const loaded = (count = 2) =>
  until(() => expect(rows().filter((row) => row.querySelector("button"))).toHaveLength(count));

// A button's words, without the hidden pending label it keeps for its width
const spoken = (item: Element) => {
  const copy = item.cloneNode(true) as Element;

  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());

  return copy.textContent;
};

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === name || spoken(item) === name,
  )!;

const press = (name: string) => act(async () => button(name).click());

const dialog = () =>
  document.querySelector<HTMLElement>(
    '[role="dialog"]:not([data-type]), [role="alertdialog"]:not([data-type])',
  );

const control = (label: string) => {
  const name = [...document.querySelectorAll("label")].find((item) => item.textContent === label);
  const field = name && document.getElementById(name.htmlFor);

  if (field instanceof HTMLInputElement) return field;
  throw new Error(`No field is labelled ${label}`);
};

/** The error shown under a field, which marks it invalid and is read out with it. */
const errorOf = (label: string) => {
  const field = control(label);
  const ids = field.getAttribute("aria-describedby")?.split(" ") ?? [];
  const error = field.parentElement?.querySelector(".text-error");

  if (error) expect(ids).toContain(error.id);

  return error?.textContent ?? undefined;
};

const enter = (label: string, value: string) =>
  act(async () => {
    const field = control(label);

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

const submit = () =>
  act(async () => dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

const closed = () => until(() => expect(dialog()).toBeNull());

test("Collections lists each collection with its record count, its name opening its records", async () => {
  await mount(<CollectionsScreen api={api()} />);
  await until(() => expect(host.querySelector("tbody a")).not.toBeNull());

  const link = host.querySelector<HTMLAnchorElement>("tbody a")!;

  expect(link.textContent).toBe("Ministries and departments");
  expect(link.getAttribute("href")).toBe("/collections/contacts");
  expect(cells(rows()[0]!)).toEqual([expect.stringContaining("contacts"), "2"]);
  expect(host.querySelector("h1")?.textContent).toBe("Collections");
});

test("a collection's records fill the shared table, a column per field with its key first", async () => {
  await renderCollection().ready;
  await loaded();

  const headers = [...host.querySelectorAll("thead th")].map((th) => th.textContent);

  expect(headers).toEqual(["Key", "Name", "Email", "Telephone", "Actions"]);
  expect(cells(rows()[0]!).slice(0, 4)).toEqual([
    "barbados-drug-service",
    "Barbados Drug Service",
    "management@drugservice.gov.bb",
    "(246) 535-4300",
  ]);
  // A field a record doesn't hold says so in words
  expect(cells(rows()[1]!)[2]).toBe("None");
  expect(host.querySelector("h1")?.textContent).toBe("Ministries and departments");
  // Each row's actions name their record, for keyboard and screen reader users
  expect(button("Edit nis").tagName).toBe("BUTTON");
  expect(button("Delete nis").disabled).toBe(false);
});

test("an unknown collection says so, with the way back", async () => {
  await renderCollection({ key: "missing" }).ready;
  await until(() => expect(host.textContent).toContain("Collection not found"));

  expect(host.querySelector('a[href="/collections"]')?.textContent).toBe("Back to collections");
});

test("Add record saves a new record to api_v2, leaving blank fields out", async () => {
  await renderCollection().ready;
  await loaded();
  await press("Add record");

  expect(dialog()?.textContent).toContain("Add a record");
  await enter("Key", "barbados-revenue-authority");
  await enter("Name (optional)", "  Barbados Revenue Authority ");
  await submit();
  await closed();

  expect(server.writes).toEqual([
    {
      method: "POST",
      path: "/collections/contacts/records/barbados-revenue-authority",
      body: { data: { key: "barbados-revenue-authority", name: "Barbados Revenue Authority" } },
      ifUpdatedAt: null,
    },
  ]);
  await loaded(3);
  expect(document.body.textContent).toContain("Record added");
});

test("a new record's key is checked before anything is sent", async () => {
  await renderCollection().ready;
  await loaded();
  await press("Add record");
  await submit();

  expect(errorOf("Key")).toBe("Enter a key");
  await enter("Key", "Revenue Authority");
  await submit();
  expect(errorOf("Key")).toBe(
    "Use only lower-case letters, numbers and single hyphens between words",
  );
  expect(server.writes).toEqual([]);
});

test("a key that's taken is refused next to the key, keeping what was typed", async () => {
  await renderCollection().ready;
  await loaded();
  await press("Add record");
  await enter("Key", "nis");
  await enter("Name (optional)", "Another NIS");
  await submit();
  await until(() => expect(errorOf("Key")).toBe("Another record already has this key"));

  expect(control("Name (optional)").value).toBe("Another NIS");
  expect(dialog()).not.toBeNull();
});

test("a ?record= address opens that record's dialog with its values", async () => {
  const { ready } = renderCollection({ record: "barbados-drug-service" });

  await ready;
  await until(() => expect(dialog()?.textContent).toContain("Edit barbados-drug-service"));

  expect(control("Name (optional)").value).toBe("Barbados Drug Service");
  expect(control("Email (optional)").inputMode).toBe("email");
  // A record keeps its key: the url it's saved at names it
  expect(control("Key").readOnly).toBe(true);
  // The first field has the focus, so the keyboard starts in the form
  await until(() => expect(document.activeElement).toBe(control("Name (optional)")));
});

test("an address naming a record that isn't there says so, and opens nothing", async () => {
  await renderCollection({ record: "gone" }).ready;
  await loaded();

  expect(host.textContent).toContain("There is no record “gone” in this collection.");
  expect(dialog()).toBeNull();
});

test("Edit asks the address for the record, and closing clears it", async () => {
  const { asked, ready } = renderCollection();

  await ready;
  await loaded();
  await press("Edit nis");
  await until(() => expect(dialog()?.textContent).toContain("Edit nis"));
  await press("Cancel");
  await closed();

  expect(asked).toEqual(["nis", undefined]);
});

test("saving replaces the record over the version read, a cleared field removed", async () => {
  await renderCollection({ record: "barbados-drug-service" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await enter("Telephone (optional)", "");
  await enter("Name (optional)", "Drug Service");
  await submit();
  await closed();

  expect(server.writes).toEqual([
    {
      method: "PUT",
      path: "/collections/contacts/records/barbados-drug-service",
      body: {
        data: {
          key: "barbados-drug-service",
          name: "Drug Service",
          email: "management@drugservice.gov.bb",
        },
      },
      ifUpdatedAt: stamp(0),
    },
  ]);
  await until(() => expect(cells(rows()[0]!)[1]).toBe("Drug Service"));
  expect(document.body.textContent).toContain("Record saved");
});

test("a field api_v2 refuses shows its reason next to it, and the input is kept", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await enter("Email (optional)", "not an email");
  server.refuse(400, {
    error: "validation_failed",
    message: "Not saved.",
    errors: [
      { field: "email", message: "Enter an email address." },
      { field: "fax", message: "fax is not a field of contacts." },
    ],
  });
  await submit();
  await until(() => expect(errorOf("Email (optional)")).toBe("Enter an email address."));

  expect(control("Email (optional)").value).toBe("not an email");
  // One the dialog has no field for is told in the dialog
  expect(dialog()?.textContent).toContain("fax is not a field of contacts.");
});

test("a 400 that isn't validation_failed is no field's fault", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  server.refuse(400, { statusCode: 400, error: "Bad Request", message: "body must be object" });
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain("The record could not be saved. Try again."),
  );

  expect(errorOf("Name (optional)")).toBeUndefined();
});

test("closing a record opened from the address gives the focus to its row's Edit", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await press("Cancel");
  await closed();

  // Nothing opened it, so there's no button to go back to: the record's own row takes the focus
  await until(() => expect(document.activeElement?.getAttribute("data-edit")).toBe("nis"));
});

test("a stale save offers to keep mine, load the saved version or download mine", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await enter("Name (optional)", "Mine");
  server.change("nis", { name: "Theirs" });
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain(
      "A newer version of this record has been saved since you opened it.",
    ),
  );
  await until(() => expect(button("Load saved version").disabled).toBe(false));

  expect(button("Download my version")).toBeDefined();
  // Nothing is overwritten until the author chooses. Save can't be used, but stays focusable, so a refused save
  // leaves the focus on it
  const save = dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const sent = server.writes.length;

  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(save.disabled).toBe(false);
  await submit();
  expect(server.writes).toHaveLength(sent);
  expect(control("Name (optional)").value).toBe("Mine");

  await press("Keep my version");
  await submit();
  await closed();

  const last = server.writes.at(-1)!;

  expect(last.method).toBe("PUT");
  expect(last.body).toEqual({ data: { key: "nis", name: "Mine" } });
  expect(last.ifUpdatedAt).toBe(stamp(1));
});

test("Load saved version puts the newer values in the dialog", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await enter("Name (optional)", "Mine");
  server.change("nis", { name: "Theirs" });
  await submit();
  await until(() => expect(button("Load saved version")?.disabled).toBe(false));
  await press("Load saved version");

  expect(control("Name (optional)").value).toBe("Theirs");
  // The notice and its button have gone, so the focus moves into the form, not to the page behind
  await until(() => expect(document.activeElement).toBe(control("Name (optional)")));
  expect(dialog()?.textContent).not.toContain("A newer version");
});

test("a record deleted meanwhile can't be saved, and offers a download", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  await enter("Name (optional)", "Mine");
  server.remove("nis");
  await submit();
  await until(() => expect(dialog()?.textContent).toContain("This record has been deleted"));

  expect(button("Download my version")).toBeDefined();
  expect(control("Name (optional)").value).toBe("Mine");
});

test("Delete asks first, then deletes the version read", async () => {
  await renderCollection().ready;
  await loaded();
  await press("Delete nis");

  expect(dialog()?.getAttribute("role")).toBe("alertdialog");
  expect(dialog()?.textContent).toContain("Delete nis?");
  expect(server.writes).toEqual([]);
  // Cancel comes first, so a stray Enter keeps the record
  await until(() => expect(document.activeElement?.textContent).toBe("Cancel"));
  await press("Delete record");
  await closed();

  expect(server.writes).toEqual([
    {
      method: "DELETE",
      path: "/collections/contacts/records/nis",
      body: undefined,
      ifUpdatedAt: stamp(0),
    },
  ]);
  await loaded(1);
  expect(document.body.textContent).toContain("Record deleted");
});

test("a stale delete is refused in the dialog", async () => {
  await renderCollection().ready;
  await loaded();
  await press("Delete nis");
  server.change("nis", { name: "Theirs" });
  await press("Delete record");
  await until(() =>
    expect(dialog()?.textContent).toContain("This record has changed since you opened it."),
  );
});

test("without the editor role, records can be read but not added, saved or deleted", async () => {
  await renderCollection({ readOnly: true, record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());

  expect(control("Name (optional)").readOnly).toBe(true);
  expect(dialog()!.querySelector('button[type="submit"]')).toBeNull();
  expect(button("Add record").disabled).toBe(true);
  expect(button("Delete nis").disabled).toBe(true);
  expect(button("View nis").textContent).toBe("View");
});

test("a value for a field the collection no longer lists is named, then removed on save", async () => {
  server.change("nis", { fax: "431-0000" });
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());

  expect(dialog()?.textContent).toContain(
    "Saving removes values for fields this collection no longer has: fax.",
  );
  await submit();
  await closed();
  expect(server.writes.at(-1)?.body).toEqual({ data: { key: "nis", name: "National Insurance" } });
});

test("a save whose answer is lost is never reported as failed", async () => {
  await renderCollection({ record: "nis" }).ready;
  await until(() => expect(dialog()).not.toBeNull());
  server.refuse(503, { error: "unavailable", message: "Down." });
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain("We couldn't confirm whether this record was saved."),
  );

  expect(dialog()?.textContent).not.toContain("Try again.");
});
