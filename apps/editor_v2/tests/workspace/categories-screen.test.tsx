/** @vitest-environment jsdom */
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Category, CategoryFields, CategoryOrder } from "../../src/api/categories";
import { createEditorApi } from "../../src/api/client";
import { retryContentRead } from "../../src/api/queries";
import { Toaster } from "../../src/ui/toast";
import { CategoriesScreen } from "../../src/workspace/categories-screen";
import { shownText } from "../helpers/shown-text";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const EDUCATION = id(1);

const HEALTH = id(2);

const YOUTH = id(3);

const SPORT = id(4);

const ARTS = id(5);

/** A row as the content API keeps it; its address, count and version follow from the rest. */
type Stored = Omit<Category, "url" | "updated_at"> & { version: number };

const seed = (): Stored[] => [
  {
    id: EDUCATION,
    parent_id: null,
    title: "Education",
    slug: "education",
    description: null,
    position: 0,
    services: 2,
    reserved_route: false,
    version: 0,
  },
  {
    id: HEALTH,
    parent_id: null,
    title: "Health",
    slug: "health",
    description: null,
    position: 1,
    services: 0,
    reserved_route: false,
    version: 0,
  },
  {
    id: YOUTH,
    parent_id: null,
    title: "Youth and community",
    slug: "youth-and-community",
    description: null,
    position: 2,
    services: 0,
    reserved_route: false,
    version: 0,
  },
  {
    id: SPORT,
    parent_id: YOUTH,
    title: "Sport",
    slug: "sport",
    description: null,
    position: 0,
    services: 1,
    reserved_route: false,
    version: 0,
  },
  {
    id: ARTS,
    parent_id: YOUTH,
    title: "Arts",
    slug: "arts",
    description: null,
    position: 1,
    services: 0,
    reserved_route: false,
    version: 0,
  },
];

const stamp = (version: number) => new Date(Date.UTC(2026, 9, 26, 12, 0, 0, version)).toISOString();

/**
 * The content API's category routes, kept in memory with their versions, so the screen's real client and queries can
 * be exercised through HTTP. `hold` keeps the next request of a kind waiting; `lose` drops the next one's answer after
 * acting on it, as a connection that fails after the commit does.
 */
function contentApi() {
  let stored = seed();
  let clock = 1;
  const writes: { method: string; path: string; body: unknown; ifUpdatedAt: string | null }[] = [];
  const held = new Map<string, PromiseWithResolvers<void>>();
  const lost = new Set<string>();
  let unavailable = 0;
  let malformed = 0;
  const failing = new Map<string, number>();
  const unapplied = new Map<string, number>();
  let refusal: number | undefined;

  const url = (row: Stored): string => {
    const parent = stored.find((other) => other.id === row.parent_id);

    return parent ? `/${parent.slug}/${row.slug}` : `/${row.slug}`;
  };

  const read = (row: Stored): Category => {
    const { version, ...fields } = row;

    return { ...fields, url: url(row), updated_at: stamp(version) };
  };

  const ordered = () => {
    const group = (parent: string | null) =>
      stored.filter((row) => row.parent_id === parent).toSorted((a, b) => a.position - b.position);

    return group(null)
      .flatMap((row) => [row, ...group(row.id)])
      .map(read);
  };

  const json = (body: Parameters<typeof Response.json>[0], status = 200) =>
    Response.json(body, { status });

  const respond = async (
    method: string,
    path: string,
    body: CategoryFields & CategoryOrder,
    ifUpdatedAt: string | null,
  ) => {
    if (method === "GET") return json({ categories: ordered() });
    writes.push({ method, path, body, ifUpdatedAt });

    if (method === "POST") {
      const fields: CategoryFields = body;

      if (stored.some((row) => row.slug === fields.slug))
        return json(
          {
            error: "validation_failed",
            message: "Not saved.",
            errors: [{ field: "slug", message: "Another category already uses this slug." }],
          },
          422,
        );

      const row: Stored = {
        ...fields,
        title: fields.title.trim(),
        description: fields.description?.trim() || null,
        id: id(100 + clock),
        position: stored.filter((other) => other.parent_id === fields.parent_id).length,
        services: 0,
        reserved_route: false,
        version: clock++,
      };

      stored = [...stored, row];

      return json(read(row), 201);
    }

    if (path === "/editor/categories/order") {
      const order: CategoryOrder = body;

      const siblings = stored.filter((row) => row.parent_id === order.parent_id);

      const current = order.expected.every(
        (expected) =>
          stamp(siblings.find((row) => row.id === expected.id)?.version ?? -1) ===
          expected.updated_at,
      );

      if (!current || order.expected.length !== siblings.length)
        return json(
          { error: "conflict", message: "These categories changed since you loaded them." },
          409,
        );

      const version = clock++;

      stored = stored.map((row) => {
        const position = order.ordered_ids.indexOf(row.id);

        return position === -1 || position === row.position ? row : { ...row, position, version };
      });

      return json({ categories: ordered().filter((row) => row.parent_id === order.parent_id) });
    }

    const target = stored.find((row) => path === `/editor/categories/${row.id}`);

    if (!target) return json({ error: "not_found", message: "No category." }, 404);

    if (stamp(target.version) !== ifUpdatedAt)
      return json(
        { error: "conflict", message: "These categories changed since you loaded them." },
        409,
      );

    if (method === "DELETE") {
      const pages = target.services;
      const subcategories = stored.filter((row) => row.parent_id === target.id).length;

      if (pages || subcategories || target.reserved_route)
        return json(
          {
            error: "category_in_use",
            message:
              "This category still has pages, subcategories, or a reserved app-route address.",
            blockers: { pages, subcategories, reserved_route: target.reserved_route },
          },
          409,
        );
      stored = stored.filter((row) => row !== target);

      return new Response(null, { status: 204 });
    }

    const fields: CategoryFields = body;

    const saved: Stored = {
      ...target,
      ...fields,
      title: fields.title.trim(),
      description: fields.description?.trim() || null,
      position:
        fields.parent_id === target.parent_id
          ? target.position
          : stored.filter((row) => row.parent_id === fields.parent_id).length,
      version: clock++,
    };

    stored = stored.map((row) => (row === target ? saved : row));

    return json(read(saved));
  };

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    const method = init?.method ?? "GET";
    const kind = method === "GET" ? "read" : path === "/editor/categories/order" ? "order" : method;

    if (path !== "/editor/categories" && !path.startsWith("/editor/categories/"))
      return Response.json([]);

    await held.get(kind)?.promise;
    held.delete(kind);

    if (method === "GET" && unavailable > 0) {
      unavailable -= 1;

      return new Response(null, { status: 503 });
    }

    if (method === "GET" && refusal) return new Response(null, { status: refusal });

    // A gateway that timed out before the write was made: the same 5xx, nothing changed yet
    const unmade = unapplied.get(kind);

    if (unmade) {
      unapplied.delete(kind);

      return new Response(null, { status: unmade });
    }

    if (method === "GET" && malformed > 0) {
      malformed -= 1;

      return Response.json({ categories: [{ id: "not-a-category" }] });
    }

    // The screen's own client wrote this JSON from its route's request type, CategoryFields or CategoryOrder
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    const answer = await respond(
      method,
      path,
      body,
      new Headers(init?.headers).get("if-updated-at"),
    );

    if (lost.delete(kind)) throw new TypeError("Failed to fetch");

    // A gateway that timed out after the write was made
    const failed = failing.get(kind);

    if (failed) {
      failing.delete(kind);

      return new Response(null, { status: failed });
    }

    return answer;
  });

  return {
    fetch,
    writes,
    /** The next request of a kind (read, POST, PUT, DELETE, order) waits for the returned release. */
    hold: (kind: string) => {
      const waiting = Promise.withResolvers<void>();

      held.set(kind, waiting);

      return () => waiting.resolve();
    },
    /** The next request of a kind is acted on, but its answer never arrives. */
    lose: (kind: string) => void lost.add(kind),
    /** The next reads answer with something that isn't a list of categories. */
    malformReads: (count: number) => void (malformed = count),
    /** The next request of a kind is acted on, then answered with this 5xx status. */
    failAfterWrite: (kind: string, status: number) => void failing.set(kind, status),
    /** The next request of a kind is answered with this 5xx status without being acted on. */
    failBeforeWrite: (kind: string, status: number) => void unapplied.set(kind, status),
    /** The next reads fail on the API's side. */
    failReads: (count: number) => void (unavailable = count),
    /** Every read is refused with this status from now on. */
    refuseReads: (status: number) => void (refusal = status),
    /** Someone else's change, made straight in the content API. */
    change: (categoryId: string, fields: Partial<Stored>) => {
      stored = stored.map((row) =>
        row.id === categoryId ? { ...row, ...fields, version: clock++ } : row,
      );
    },
    /** A page filed under a category: the page changes, so the category's version doesn't. */
    file: (categoryId: string) => {
      stored = stored.map((row) =>
        row.id === categoryId ? { ...row, services: row.services + 1 } : row,
      );
    },
    remove: (categoryId: string) => void (stored = stored.filter((row) => row.id !== categoryId)),
    add: (row: Stored) => void (stored = [...stored, row]),
  };
}

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/services" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/categories"] }),
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

/** The screen on a fresh cache, as the workspace shows it. */
const render = (readOnly = false) =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <CategoriesScreen api={createEditorApi("https://api.example.test")} readOnly={readOnly} />
          <Toaster />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  );

const rows = () => [...host.querySelectorAll("tbody tr")];

const names = () => rows().map((row) => row.querySelector("td span")?.textContent);

// What the screen's live regions are saying
const said = () =>
  [...host.querySelectorAll('[role="status"]')].flatMap((node) => node.textContent || []);

// The rows picked out as just moved
const tinted = () =>
  rows()
    .filter((row) => row.className.includes("bg-blue-10"))
    .map((row) => row.querySelector("td span")?.textContent);

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const loaded = (count = 5) => until(() => expect(names()).toHaveLength(count));

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === name || shownText(item) === name,
  )!;

// An open dialog; a toast is a dialog too, so only those the screen opens count
const dialog = () =>
  document.querySelector<HTMLElement>(
    '[role="dialog"]:not([data-type]), [role="alertdialog"]:not([data-type])',
  );

const control = (label: string) => {
  const name = [...document.querySelectorAll("label")].find((item) => item.textContent === label)!;
  const field = document.getElementById(name.htmlFor);

  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) return field;
  throw new Error(`No field is labelled ${label}`);
};

/** Types or chooses as a browser would: React reads the new value from the event. */
const enter = (label: string, value: string) =>
  act(async () => {
    const field = control(label);
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;

    Object.getOwnPropertyDescriptor(prototype.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });

const press = (name: string) => act(async () => button(name).click());

// The button that finishes the dialog's task: the last with words, after Cancel
const mainAction = () =>
  [...dialog()!.querySelectorAll<HTMLButtonElement>("button")]
    .filter((item) => item.textContent)
    .at(-1)!;

const submit = () =>
  act(async () => dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

const closed = () => until(() => expect(dialog()).toBeNull());

const refresh = () =>
  act(async () => client.invalidateQueries({ queryKey: ["content", "categories"] }));

test("lists each category with its address and services, subcategories under their parent", async () => {
  await render();
  await loaded();

  expect(names()).toEqual(["Education", "Health", "Youth and community", "Sport", "Arts"]);
  expect(rows()[3]!.textContent).toContain("/youth-and-community/sport");
  // Counted where the narrow layout shows it too
  expect(rows()[0]!.textContent).toContain("2 services");
  // The content API keeps them, so nothing says they're a preview
  expect(host.textContent).not.toContain("Preview only");
  expect(server.fetch.mock.calls[0]?.[0]).toBe("https://api.example.test/editor/categories");
});

test("headers that can't sort sit in the sort toggle's height, end-aligned ones still at the end", async () => {
  await render();
  await loaded();

  const headers = [...host.querySelectorAll("thead th")];

  expect(headers.map((th) => th.textContent)).toEqual(["Name", "Services", "Actions"]);

  for (const th of headers) {
    const box = th.firstElementChild!;

    // As tall as a sort toggle's min-h-8, 44px under a coarse pointer as the toggle is, as a full-width block so its
    // label can align to its end
    expect(box.className).toContain("min-h-8");
    expect(box.className).toContain("pointer-coarse:min-h-11");
    expect(box.className).toContain("flex-col");
    expect(box.className).not.toMatch(/inline-flex|\bw-fit\b/);
    expect(th.querySelector("button")).toBeNull();
    expect(th.getAttribute("aria-sort")).toBeNull();
  }

  expect(headers[1]!.querySelector(".text-end")?.textContent).toBe("Services");
  expect(headers[2]!.querySelector(".text-end")?.textContent).toBe("Actions");
});

test("the list sits in a card with a defined grey edge over the sheet's shadow", async () => {
  await render();
  await loaded();

  const card = host.querySelector("table")!.closest(".shadow-sheet")!;

  // The sheet's shadow alone is a 6% edge, too faint on the grey page: the existing grey-40 ring draws it
  expect(card.classList).toContain("ring-1");
  expect(card.classList).toContain("ring-grey-40");
  expect(card.classList).toContain("rounded-sm");
});

test("a subcategory hangs from its parent, lighter, and says whose it is", async () => {
  await render();
  await loaded();

  const elbow = (row: Element) => row.querySelector('td:first-child svg[aria-hidden="true"]');
  const said = (row: Element) => row.querySelector("td:first-child .sr-only")?.textContent;
  const [education, , youth, sport, arts] = rows();

  // A top-level category: no elbow, its name in the table's semibold, nothing more to hear
  expect(elbow(education!)).toBeNull();
  expect(said(education!)).toBeUndefined();
  expect(youth!.querySelector("td:first-child .font-semibold .font-normal")).toBeNull();

  // No weight but the interface's own two: semibold for a parent, regular for a subcategory
  expect(host.querySelector("tbody .font-medium")).toBeNull();

  // A subcategory: a decorative elbow, its name in the regular weight, and its parent's name read out after its own
  for (const row of [sport!, arts!]) {
    expect(elbow(row)).not.toBeNull();
    expect(row.querySelector("td:first-child .font-semibold .font-normal")?.textContent).toBe(
      names()[rows().indexOf(row)],
    );
    expect(said(row)).toBe(", subcategory of Youth and community");
  }

  // The words follow the parent's record, so a renamed parent is named anew
  server.change(YOUTH, { title: "Young people" });
  await refresh();
  await until(() => expect(said(rows()[3]!)).toBe(", subcategory of Young people"));
});

test("moves a category with every sibling's version, keeping the focus and saying where it went", async () => {
  await render();
  await loaded();

  expect(button("Move Education up").disabled).toBe(true);
  expect(button("Move Youth and community down").disabled).toBe(true);
  expect(button("Move Sport up").disabled).toBe(true);
  expect(button("Move Arts down").disabled).toBe(true);

  button("Move Health up").focus();
  await press("Move Health up");

  await until(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Sport", "Arts"]),
  );
  expect(server.writes.at(-1)).toMatchObject({
    path: "/editor/categories/order",
    body: {
      parent_id: null,
      expected: [EDUCATION, HEALTH, YOUTH].map((sibling) => ({
        id: sibling,
        updated_at: stamp(0),
      })),
      ordered_ids: [HEALTH, EDUCATION, YOUTH],
    },
  });
  // Tinted in its new place, so a pointer can follow it there
  expect(rows()[0]!.className).toContain("bg-blue-10");
  // At the top, up can't move it further, so down keeps the focus
  await until(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Health down"),
  );
  expect(said()).toContain("Health moved up: 1 of 3");

  // A subcategory moves only among its parent's subcategories, from the versions the last move saved
  await press("Move Arts up");
  await until(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Arts", "Sport"]),
  );
  expect(tinted()).toEqual(["Arts"]);

  // The order was saved, so a fresh read keeps it
  await refresh();
  await until(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Arts", "Sport"]),
  );
});

test("one move at a time in a sibling group: the rest wait, still focusable", async () => {
  await render();
  await loaded();
  const release = server.hold("order");

  button("Move Health up").focus();
  await press("Move Health up");
  // While it's saved, its group's moves are named and focusable, but do nothing; the one pressed turns as it waits
  expect(button("Move Health down").getAttribute("aria-disabled")).toBe("true");
  expect(button("Move Education down").getAttribute("aria-disabled")).toBe("true");
  expect(button("Move Health up").disabled).toBe(false);
  expect(button("Move Health up").hasAttribute("data-pending")).toBe(true);
  expect(host.querySelectorAll("[data-pending]")).toHaveLength(1);
  expect(document.activeElement).toBe(button("Move Health up"));
  await press("Move Health up");
  await press("Move Education down");
  // Another group moves meanwhile
  expect(button("Move Arts up").getAttribute("aria-disabled")).toBeNull();

  await act(async () => release());
  await until(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Sport", "Arts"]),
  );
  expect(server.writes.filter((write) => write.path === "/editor/categories/order")).toHaveLength(
    1,
  );
  expect(button("Move Health down").getAttribute("aria-disabled")).toBeNull();
  expect(host.querySelector("[data-pending]")).toBeNull();
});

test("the tint stays on through a run of moves, and clears two seconds after the last", async () => {
  await render();
  await loaded();
  await press("Move Health up");
  await until(() => expect(tinted()).toEqual(["Health"]));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  try {
    const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    await wait(1500);
    await press("Move Health down");
    await until(() => expect(names()[0]).toBe("Education"));
    // Past the first move's two seconds, the second move's tint holds
    await wait(600);
    expect(tinted()).toEqual(["Health"]);
    await wait(1400);
    expect(tinted()).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

const categoryReads = () =>
  server.fetch.mock.calls.filter(([, init]) => !init?.method || init.method === "GET").length;

/** The next GET holds an already-read response, not a database read delayed until after the write. */
async function holdCategorySnapshot() {
  const snapshot = await server.fetch("https://api.example.test/editor/categories");
  const held = Promise.withResolvers<void>();

  server.fetch.mockImplementationOnce(async () => {
    await held.promise;

    return snapshot;
  });

  return () => held.resolve();
}

test.each([
  ["POST", "Add category", "Housing"],
  ["PUT", "Edit Health", "Health services"],
  ["DELETE", "Delete Health", ""],
] as const)(
  "a lost %s checks a new response, not a pre-write snapshot",
  async (method, open, name) => {
    await render();
    await loaded();
    await press(open);

    if (name) await enter("Name", name);
    const release = await holdCategorySnapshot();
    let refreshing = Promise.resolve();

    await act(async () => {
      refreshing = client.refetchQueries({ queryKey: ["content", "categories"] });
    });
    const reads = categoryReads();
    server.lose(method);

    try {
      if (method === "DELETE") await press("Delete category");
      else await submit();
      expect(categoryReads()).toBeGreaterThan(reads);
      await closed();
    } finally {
      await act(async () => {
        release();
        await refreshing;
      });
    }

    await until(() => expect(client.isFetching()).toBe(0));

    if (name) expect(names()).toContain(name);
    else expect(names()).not.toContain("Health");
    expect(server.writes.filter((write) => write.method === method)).toHaveLength(1);
  },
);

test("a lost move checks a new response, not a pre-write snapshot", async () => {
  await render();
  await loaded();
  const release = await holdCategorySnapshot();
  let refreshing = Promise.resolve();

  await act(async () => {
    refreshing = client.refetchQueries({ queryKey: ["content", "categories"] });
  });
  const reads = categoryReads();
  server.lose("order");

  try {
    await press("Move Health up");
    expect(categoryReads()).toBeGreaterThan(reads);
    await until(() => expect(said()).toContain("Health moved up: 1 of 3"));
  } finally {
    await act(async () => {
      release();
      await refreshing;
    });
  }

  await until(() => expect(names()[0]).toBe("Health"));
  expect(server.writes).toHaveLength(1);
});

test("another group's successful move cannot cancel a lost move's check", async () => {
  await render();
  await loaded();
  const release = server.hold("read");
  const reads = categoryReads();
  server.lose("order");
  await press("Move Health up");
  await until(() => expect(categoryReads()).toBe(reads + 1));

  try {
    await press("Move Arts up");
    await until(() => expect(names()).toContain("Arts"));
    expect(button("Move Health down").getAttribute("aria-disabled")).toBe("true");
    await press("Move Health down");
    expect(server.writes).toHaveLength(2);
  } finally {
    await act(async () => release());
  }

  await until(() => expect(said()).toContain("Health moved up: 1 of 3"));
  await until(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Arts", "Sport"]),
  );
});

test.each([true, false])(
  "a failed recovery read releases the dialog without retries (online: %s)",
  async (online) => {
    await render();
    await loaded();
    client.setDefaultOptions({ queries: { retry: retryContentRead } });
    await press("Edit Health");
    await enter("Name", "Health services");
    server.lose("PUT");
    server.failReads(4);
    const reads = categoryReads();
    onlineManager.setOnline(online);

    try {
      await submit();
      await until(() => expect(shownText(mainAction())).toBe("Check again"));
      expect(button("Cancel").disabled).toBe(false);
      expect(control("Name").value).toBe("Health services");
      expect(categoryReads()).toBe(reads + 1);
      expect(server.writes).toHaveLength(1);
    } finally {
      onlineManager.setOnline(true);
    }
  },
);

test.each(["edit", "delete"] as const)(
  "loading a conflicting %s's version is labelled as a check, not a write",
  async (operation) => {
    await render();
    await loaded();
    await press(operation === "edit" ? "Edit Health" : "Delete Health");
    server.change(HEALTH, { description: "Clinics" });

    if (operation === "edit") await submit();
    else await press("Delete category");
    await until(() => expect(shownText(mainAction())).toBe("Load their version"));
    const writes = server.writes.length;
    const release = server.hold("read");

    try {
      await act(async () => mainAction().click());
      expect(shownText(mainAction())).toBe("Checking category…");
      expect(server.writes).toHaveLength(writes);
    } finally {
      await act(async () => release());
    }

    await until(() =>
      expect(shownText(mainAction())).toBe(
        operation === "edit" ? "Save category" : "Delete category",
      ),
    );
  },
);

test.each([
  ["POST", "Add category", "added"],
  ["PUT", "Edit Health", "saved"],
  ["DELETE", "Delete Health", "deleted"],
] as const)("a refused %s explains what was not saved", async (method, open, verb) => {
  await render();
  await loaded();
  await press(open);

  if (method === "POST") await enter("Name", "Housing");
  server.failBeforeWrite(method, 400);

  if (method === "DELETE") await press("Delete category");
  else await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain(`The category could not be ${verb}. Try again.`),
  );
  expect(server.writes).toHaveLength(0);
});

test("a background read started before a move doesn't put the old order back", async () => {
  await render();
  await loaded();
  const release = server.hold("read");
  let refreshing = Promise.resolve();

  await act(async () => {
    refreshing = client.refetchQueries({ queryKey: ["content", "categories"] });
  });
  await press("Move Youth and community up");
  await until(() =>
    expect(names()).toEqual(["Education", "Youth and community", "Sport", "Arts", "Health"]),
  );
  await act(async () => {
    release();
    await refreshing;
  });
  await until(() => expect(client.isFetching()).toBe(0));
  expect(names()).toEqual(["Education", "Youth and community", "Sport", "Arts", "Health"]);
});

test("a move someone else got to first is refused, and the list shows their changes", async () => {
  await render();
  await loaded();
  server.change(EDUCATION, { title: "Schools" });
  await press("Move Health up");

  await until(() => expect(names()).toContain("Schools"));
  expect(document.body.textContent).toContain("Someone changed these categories first");
  expect(names()).toEqual(["Schools", "Health", "Youth and community", "Sport", "Arts"]);
});

test("someone who can't make changes can't move a category", async () => {
  await render(true);
  await loaded();

  expect(button("Move Health up").disabled).toBe(true);
  expect(button("Move Health down").disabled).toBe(true);
});

test("a move the API refuses (403) says why, not to try again", async () => {
  const message = "You need the editor role to make changes. Ask an admin to grant it.";

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PUT"
        ? Response.json({ error: "forbidden", message }, { status: 403 })
        : server.fetch(input, init),
    ),
  );
  await render();
  await loaded();
  await press("Move Health up");

  await until(() => expect(document.body.textContent).toContain(message));
  expect(document.body.textContent).not.toContain("Try again");
  expect(names()).toEqual(["Education", "Health", "Youth and community", "Sport", "Arts"]);
});

test("a move whose answer was lost is checked against the list before another can be sent", async () => {
  await render();
  await loaded();
  server.lose("order");
  await press("Move Health up");

  // It went through, so the list says where it went, and only one move was ever sent
  await until(() => expect(said()).toContain("Health moved up: 1 of 3"));
  expect(names()).toEqual(["Health", "Education", "Youth and community", "Sport", "Arts"]);
  expect(server.writes.filter((write) => write.path === "/editor/categories/order")).toHaveLength(
    1,
  );

  // Lost, and the list can't be read either: the next press checks again instead of moving
  server.lose("order");
  server.failReads(1);
  await press("Move Health down");
  await until(() =>
    expect(document.body.textContent).toContain("couldn’t tell whether the category moved"),
  );
  await press("Move Health down");
  await until(() => expect(said()).toContain("The last move was saved."));
  expect(server.writes.filter((write) => write.path === "/editor/categories/order")).toHaveLength(
    2,
  );
  expect(names()).toEqual(["Education", "Health", "Youth and community", "Sport", "Arts"]);
});

test("adds a category whose slug follows its name, after its parent's other subcategories", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Dance & movement");

  expect(control("Slug").value).toBe("dance-movement");

  await enter("Parent category", YOUTH);

  expect(dialog()?.textContent).toContain("/youth-and-community/dance-movement");

  await submit();
  await closed();
  await until(() => expect(names()).toContain("Dance & movement"));
  expect(names()).toEqual([
    "Education",
    "Health",
    "Youth and community",
    "Sport",
    "Arts",
    "Dance & movement",
  ]);
  expect(server.writes.at(-1)).toMatchObject({
    method: "POST",
    body: {
      title: "Dance & movement",
      slug: "dance-movement",
      parent_id: YOUTH,
      description: null,
    },
  });
});

test("a field's problem shows on it, which takes the focus, whether the dialog or the API found it", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Schools");
  await enter("Slug", "education");
  await submit();

  expect(dialog()?.textContent).toContain("Another category already uses this slug");
  expect(document.activeElement).toBe(control("Slug"));
  expect(control("Slug").getAttribute("aria-invalid")).toBe("true");
  expect(server.writes).toHaveLength(0);

  // Taken since the list was read: the content API refuses it the same way
  server.add({ ...seed()[1]!, id: id(50), title: "Housing", slug: "housing", position: 3 });
  await enter("Slug", "housing");
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain("Another category already uses this slug."),
  );
  expect(document.activeElement).toBe(control("Slug"));
  expect(control("Name").value).toBe("Schools");
});

test("edits a category over the version it opened with", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health and wellbeing");
  await enter("Slug", "wellbeing");
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Health and wellbeing"));
  expect(rows()[1]!.textContent).toContain("/wellbeing");
  expect(server.writes.at(-1)).toMatchObject({
    method: "PUT",
    path: `/editor/categories/${HEALTH}`,
    ifUpdatedAt: stamp(0),
  });
});

test("an address in use, or an app route's, keeps its slug and parent", async () => {
  server.change(HEALTH, { reserved_route: true });
  await render();
  await loaded();
  await press("Edit Education");

  // Services are filed under it
  expect(control("Slug").disabled).toBe(true);
  expect(control("Parent category").disabled).toBe(true);
  expect(dialog()?.textContent).toContain("Services are filed under it");
  await press("Cancel");
  await closed();

  await press("Edit Health");
  expect(control("Slug").disabled).toBe(true);
  expect(dialog()?.textContent).toContain("A page of the site’s own is at this address");
  // Its name can still change
  expect(control("Name").disabled).toBe(false);
  await press("Cancel");
  await press("Delete Health");
  expect(dialog()?.textContent).toContain("A page of the site’s own is at /health");
  expect(button("Delete category")).toBeUndefined();
});

test("a stale save keeps what was typed, and saves once their version is loaded", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health services");
  server.change(HEALTH, { description: "Clinics and hospitals" });
  await submit();

  await until(() => expect(dialog()?.textContent).toContain("Someone changed this category"));
  expect(control("Name").value).toBe("Health services");
  expect(shownText(mainAction())).toBe("Load their version");
  await act(async () => mainAction().click());
  await until(() => expect(shownText(mainAction())).toBe("Save category"));
  // What was typed stays; the save now goes over their version
  expect(control("Name").value).toBe("Health services");
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Health services"));
  expect(server.writes.at(-1)?.ifUpdatedAt).not.toBe(stamp(0));
});

test("an open edit keeps its category and what was typed through a refresh that removes it", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health services");
  server.remove(HEALTH);
  await refresh();

  await until(() => expect(names()).not.toContain("Health"));
  expect(dialog()).not.toBeNull();
  expect(control("Name").value).toBe("Health services");
  expect(dialog()?.textContent).toContain("Someone has deleted this category since you opened it.");
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain("has been deleted since you opened it"),
  );
  expect(control("Name").value).toBe("Health services");
});

test("an add whose answer was lost is found in the list instead of added twice", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Housing");
  server.lose("POST");
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Housing"));
  expect(server.writes.filter((write) => write.method === "POST")).toHaveLength(1);
});

test("an add whose outcome can't be checked asks to check again, never adds blindly", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Housing");
  // The add's answer is lost, and the check's read fails
  server.lose("POST");
  server.failReads(1);
  await submit();

  await until(() =>
    expect(dialog()?.textContent).toContain("We couldn’t tell whether that went through"),
  );
  expect(shownText(mainAction())).toBe("Check again");
  await submit();
  await closed();
  expect(server.writes.filter((write) => write.method === "POST")).toHaveLength(1);
});

test("a 5xx after a save never says it failed: one not yet found in the list is unconfirmed", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health services");
  // The save is answered 504 after it was made; the check then finds it, so the dialog closes on it
  server.failAfterWrite("PUT", 504);
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Health services"));
  expect(server.writes.filter((write) => write.method === "PUT")).toHaveLength(1);

  // A 502 whose change the list doesn't show yet: unconfirmed, never "nothing changed"
  await press("Edit Education");
  await enter("Name", "Schools");
  server.failBeforeWrite("PUT", 502);
  await submit();
  await until(() =>
    expect(dialog()?.textContent).toContain("We couldn’t find that change in the categories yet"),
  );
  expect(dialog()?.textContent).not.toMatch(/didn’t go through|nothing changed/);
  expect(control("Name").value).toBe("Schools");
});

test("a move answered 503 that the list doesn't show yet is unconfirmed, not undone", async () => {
  await render();
  await loaded();
  // Answered 503 before it was saved, as a timed-out gateway can
  server.failBeforeWrite("order", 503);
  await press("Move Health up");
  await until(() => expect(said().join(" ")).toMatch(/couldn’t find/));
  expect(said().join(" ")).not.toMatch(/didn’t go through|nothing changed/);
});

test("Cancel and Escape can't dismiss a save in flight, and a failed one keeps the draft", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health services");
  const release = server.hold("PUT");

  server.change(HEALTH, { description: "Someone else's" });
  await submit();
  expect(button("Saving category…")).toBeDefined();
  expect(button("Cancel").disabled).toBe(true);
  await press("Cancel");
  await act(async () =>
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(dialog()).not.toBeNull();

  await act(async () => release());
  await until(() => expect(dialog()?.textContent).toContain("Someone changed this category"));
  expect(control("Name").value).toBe("Health services");
  // Settled, it can be dismissed again
  expect(button("Cancel").disabled).toBe(false);
  await press("Cancel");
  await closed();
});

test("won't delete a category with services filed under it, and links to them by slug", async () => {
  await render();
  await loaded();
  await press("Edit Education");
  await enter("Name", "Schools");
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Schools"));
  await press("Delete Schools");

  expect(dialog()?.getAttribute("role")).toBe("dialog");
  expect(dialog()?.textContent).toContain(
    "2 services are filed under Schools. Move them to another category first.",
  );
  expect(dialog()?.querySelector("a")?.getAttribute("href")).toBe("/services?category=education");
  // Nothing to confirm, so no Delete button, greyed or not
  expect(button("Delete category")).toBeUndefined();
  await press("Close");
  await closed();
});

test("says what still uses a category when the content API won't delete it", async () => {
  await render();
  await loaded();
  await press("Delete Health");
  // A draft page filed under it since the list was read
  server.file(HEALTH);
  await press("Delete category");

  await until(() => expect(dialog()?.textContent).toContain("Health still has 1 page"));
  expect(names()).toContain("Health");
});

test("deletes a category nothing is filed under, at the version it opened with", async () => {
  await render();
  await loaded();
  await press("Delete Health");
  await press("Delete category");
  await closed();
  await until(() => expect(names()).not.toContain("Health"));
  expect(document.activeElement?.textContent).toBe("Add category");
  expect(server.writes.at(-1)).toMatchObject({ method: "DELETE", ifUpdatedAt: stamp(0) });
});

test("names a parent by its address too when another category shares its name", async () => {
  server.add({ ...seed()[1]!, id: id(60), title: "Health", slug: "health-care", position: 3 });
  await render();
  await loaded(6);
  await press("Add category");

  const choices = [...control("Parent category").querySelectorAll("option")].map(
    (option) => option.textContent,
  );

  expect(choices).toContain("Health (/health)");
  expect(choices).toContain("Health (/health-care)");
  expect(choices).toContain("Education");
});

test("a malformed refresh keeps the rows and an open draft, with a warning", async () => {
  await render();
  await loaded();
  await press("Edit Health");
  await enter("Name", "Health services");
  server.malformReads(1);
  await refresh();

  await until(() =>
    expect(host.textContent).toContain(
      "We could not refresh categories. Showing the last loaded list.",
    ),
  );
  expect(names()).toHaveLength(5);
  expect(control("Name").value).toBe("Health services");
});

test("keeps the list with a warning when a refresh fails, and retries", async () => {
  await render();
  await loaded();

  server.failReads(1);
  await refresh();

  expect(names()).toHaveLength(5);
  await until(() =>
    expect(host.textContent).toContain(
      "We could not refresh categories. Showing the last loaded list.",
    ),
  );

  await press("Try again");
  await until(() => expect(host.textContent).not.toContain("We could not refresh categories"));
  expect(names()).toHaveLength(5);
});

test.each([
  [401, "Your session has ended"],
  [403, "You do not have access"],
])("shows a %i refresh refusal even with cached categories", async (status, message) => {
  await render();
  await loaded();

  server.refuseReads(status);
  await refresh();

  await until(() => expect(host.textContent).toContain(message));
  expect(rows()).toHaveLength(0);

  if (status === 401) {
    const link = host.querySelector("a");

    expect(link?.textContent).toBe("Sign in again");
    expect(link?.getAttribute("href")).toContain("returnTo=%2Fcategories");
  } else expect(button("Try again")).toBeDefined();
});

test("says when the categories couldn't load, and loads them on Try again", async () => {
  server.failReads(1);
  await render();
  await until(() => expect(host.textContent).toContain("We could not load categories"));
  // The loading status outlives the failure, so a retry is a change to a live region already there
  const status = host.querySelector('p[role="status"].sr-only')!;
  const release = server.hold("read");

  expect(status.textContent).toBe("");
  await press("Try again");
  await until(() => expect(status.textContent).toBe("Loading categories…"));
  expect(status.isConnected).toBe(true);
  await act(async () => release());
  await loaded();
  expect(status.textContent).toBe("");
});
