/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEditorApi, type RecordDetail } from "../../src/api/client";
import { CollectionScreen } from "../../src/workspace/collections";
import { RecordField } from "../../src/workspace/collections/record-field";
import type { RecordValue, RecordValues } from "../../src/workspace/collections/records";
import { Toaster } from "../../src/ui/toast";

/**
 * The record dialog's controls for the field types #3782 adds: a number box, a date box, a tick box and a list
 * editor, each saving its type to api_v2.
 */

const SHELTERS = {
  key: "shelters",
  title: "Emergency shelters",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" as const },
      { key: "capacity", label: "Capacity", type: "number" as const },
      { key: "water", label: "Has water", type: "boolean" as const },
      { key: "opened", label: "Opened", type: "date" as const },
      { key: "documents", label: "Documents", type: "list" as const },
    ],
  },
  schema_version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

const ST_JUDES: RecordDetail["record"] = {
  record_key: "st-judes",
  data: {
    key: "st-judes",
    capacity: 120,
    water: true,
    opened: "2026-08-01",
    documents: ["ID card", "Proof of address"],
  },
  version: 1,
  updated_at: "2026-10-26T12:00:00.000Z",
};

type Write = { method: string; path: string; body: { data: RecordValues } };

/** api_v2's record routes over the one collection; `refuse` answers the next write with a 400. */
function contentApi() {
  let records = [ST_JUDES];
  const writes: Write[] = [];
  let refusal: { field: string; message: string } | undefined;

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = decodeURI(new URL(String(input)).pathname);
    const method = init?.method ?? "GET";

    if (path === "/collections/shelters/records")
      return Response.json({
        collection: SHELTERS,
        records: records.map(({ version: _version, ...record }) => record),
      });
    const recordKey = path.replace("/collections/shelters/records/", "");
    const target = records.find((record) => record.record_key === recordKey);

    if (method === "GET")
      return target
        ? Response.json({ collection: SHELTERS, record: target })
        : Response.json({ error: "not_found" }, { status: 404 });
    const body = JSON.parse(String(init?.body));

    writes.push({ method, path, body });

    if (refusal) {
      const errors = [refusal];

      refusal = undefined;

      return Response.json(
        { error: "validation_failed", message: errors[0]!.message, errors },
        { status: 400 },
      );
    }

    const saved = {
      record_key: recordKey,
      data: { ...body.data, key: recordKey },
      version: (target?.version ?? 0) + 1,
      updated_at: "2026-10-27T12:00:00.000Z",
    };

    records = [...records.filter((record) => record !== target), saved];

    return Response.json(method === "POST" ? saved : { collection: SHELTERS, record: saved }, {
      status: method === "POST" ? 201 : 200,
    });
  });

  return {
    fetch,
    writes,
    refuse: (field: string, message: string) => void (refusal = { field, message }),
  };
}

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/collections/$key" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/collections/shelters"] }),
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

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const mountScreen = (record?: string) => {
  const api = createEditorApi("https://api.example.test");

  function Harness() {
    const [open, setOpen] = useState(record);

    return <CollectionScreen api={api} collectionKey="shelters" record={open} onRecord={setOpen} />;
  }

  return act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <Harness />
          <Toaster />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  );
};

// The record's dialog, not a toast
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-type])');

const byLabel = <T extends HTMLElement = HTMLInputElement>(name: string) => {
  const found = [...document.querySelectorAll<T>("[aria-label]")].find(
    (item) => item.getAttribute("aria-label") === name,
  );

  if (found) return found;
  const label = [...document.querySelectorAll("label")].find((item) => item.textContent === name);
  const field = label && document.querySelector<T>(`[id="${label.htmlFor}"]`);

  if (field) return field;
  throw new Error(`Nothing is labelled ${name}`);
};

const checkbox = () => document.querySelector<HTMLElement>('[role="checkbox"]')!;

const type = (field: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

// As a keyboard user presses it: focused first, so where the focus goes next is the control's doing
const press = (element: HTMLElement) =>
  act(async () => {
    element.focus();
    element.click();
  });

const submit = () => press(dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!);

test("the table shows each type as text", async () => {
  await mountScreen();
  await until(() => expect(host.querySelector("tbody tr button")).not.toBeNull());

  const cells = [...host.querySelectorAll("tbody tr td")].map((cell) => cell.textContent);

  expect(cells).toEqual(
    expect.arrayContaining(["120", "Yes", "2026-08-01", "ID card, Proof of address"]),
  );
});

test("the dialog opens each value in its own control, and saves each as its type", async () => {
  await mountScreen("st-judes");
  await until(() => expect(dialog()?.querySelector('[role="checkbox"]')).toBeTruthy());

  const capacity = byLabel("Capacity (optional)");

  expect(capacity.value).toBe("120");
  expect(capacity.inputMode).toBe("decimal");
  const opened = byLabel("Opened (optional)");

  expect(opened.type).toBe("date");
  expect(opened.value).toBe("2026-08-01");
  // A yes or no needs no "(optional)": an unticked box is a no
  expect(checkbox().getAttribute("aria-checked")).toBe("true");
  expect(dialog()?.textContent).toContain("Has water");
  expect(dialog()?.textContent).not.toContain("Has water (optional)");
  expect(byLabel("Documents, item 1 of 2").value).toBe("ID card");
  expect(byLabel("Documents, item 2 of 2").value).toBe("Proof of address");

  await type(capacity, "0.1725");
  await press(checkbox());
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
  await type(opened, "2026-12-25");
  await submit();
  await until(() => expect(dialog()).toBeNull());

  expect(server.writes.at(-1)?.body.data).toEqual({
    key: "st-judes",
    capacity: 0.1725,
    water: false,
    opened: "2026-12-25",
    documents: ["ID card", "Proof of address"],
  });
});

test("a value api_v2 refuses shows its reason under its field, and the dialog keeps what was typed", async () => {
  await mountScreen("st-judes");
  await until(() => expect(dialog()?.querySelector('[role="checkbox"]')).toBeTruthy());

  await type(byLabel("Capacity (optional)"), "1,000");
  server.refuse("capacity", "Enter a number, such as 12 or 0.1725.");
  await submit();

  expect(server.writes.at(-1)?.body.data.capacity).toBe("1,000");
  await until(() =>
    expect(dialog()?.textContent).toContain("Enter a number, such as 12 or 0.1725."),
  );
  expect(byLabel("Capacity (optional)").value).toBe("1,000");
  expect(byLabel("Capacity (optional)").getAttribute("aria-invalid")).toBe("true");
});

/** The list editor on its own, keeping its items as the dialog would. */
function mountList(initial: string[], readOnly = false) {
  const seen: RecordValue[] = [];

  function Harness() {
    const [value, setValue] = useState<RecordValue>(initial);

    return (
      <RecordField
        type="list"
        name="Documents"
        label="Documents (optional)"
        hint="One document per item."
        value={value}
        readOnly={readOnly}
        onChange={(next) => {
          seen.push(next);
          setValue(next);
        }}
      />
    );
  }

  return { seen, ready: act(async () => root.render(<Harness />)) };
}

const items = () =>
  [...host.querySelectorAll<HTMLInputElement>('[data-part="input"]')].map((item) => item.value);

test("the list editor adds an item and puts the focus in it", async () => {
  await mountList(["ID card"]).ready;
  await press(byLabel<HTMLButtonElement>("Add item to Documents"));

  expect(items()).toEqual(["ID card", ""]);
  expect(document.activeElement).toBe(byLabel("Documents, item 2 of 2"));
  await type(byLabel("Documents, item 2 of 2"), "Proof of address");
  expect(items()).toEqual(["ID card", "Proof of address"]);
});

test("the list editor moves an item, the focus going with it, and says where it went", async () => {
  await mountList(["A", "B", "C"]).ready;

  expect(byLabel<HTMLButtonElement>("Move item 1 up").disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("Move item 3 down").disabled).toBe(true);

  await press(byLabel<HTMLButtonElement>("Move item 1 down"));
  expect(items()).toEqual(["B", "A", "C"]);
  expect(document.activeElement).toBe(byLabel("Move item 2 down"));
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe(
    "Item moved to position 2 of 3.",
  );

  // At the end, its own button is turned off, so the focus takes the other
  await press(byLabel<HTMLButtonElement>("Move item 2 down"));
  expect(items()).toEqual(["B", "C", "A"]);
  expect(document.activeElement).toBe(byLabel("Move item 3 up"));

  await press(byLabel<HTMLButtonElement>("Move item 3 up"));
  expect(items()).toEqual(["B", "A", "C"]);
  expect(document.activeElement).toBe(byLabel("Move item 2 up"));
});

test("the list editor removes an item, the focus going to the one in its place, else the one before, then to Add item", async () => {
  await mountList(["A", "B", "C"]).ready;
  await press(byLabel<HTMLButtonElement>("Remove item 1"));

  expect(items()).toEqual(["B", "C"]);
  expect(document.activeElement).toBe(byLabel("Documents, item 1 of 2"));
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe("Item 1 removed. 2 left.");

  await press(byLabel<HTMLButtonElement>("Remove item 2"));
  expect(items()).toEqual(["B"]);
  expect(document.activeElement).toBe(byLabel("Documents, item 1 of 1"));

  await press(byLabel<HTMLButtonElement>("Remove item 1"));
  expect(items()).toEqual([]);
  expect(document.activeElement).toBe(byLabel("Add item to Documents"));
  expect(host.textContent).toContain("No items.");
});

test("a read-only list shows its items with nothing to change them", async () => {
  await mountList(["A", "B"], true).ready;

  expect(items()).toEqual(["A", "B"]);
  expect(host.querySelectorAll('[data-part="input"][readonly]')).toHaveLength(2);
  expect(host.querySelector("button")).toBeNull();
});

test("a list's items are grouped under its label, with its hint read out with each", async () => {
  await mountList(["A"]).ready;

  const group = host.querySelector("fieldset");

  expect(document.getElementById(group?.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
    "Documents (optional)",
  );

  const hint = [...host.querySelectorAll("p")].find(
    (item) => item.textContent === "One document per item.",
  );

  expect(byLabel("Documents, item 1 of 1").getAttribute("aria-describedby")).toBe(hint?.id);
});
