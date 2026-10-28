/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { createEditorApi, type SavedCategory } from "../../src/api/client";
import { CategoriesScreen } from "../../src/workspace/categories-screen";
import { CreateRemoteServiceDialog } from "../../src/workspace/remote-page-dialogs";

/** A category as `GET /editor/categories` answers; a subcategory's address starts with its parent's. */
const savedCategory = (
  id: string,
  slug: string,
  title: string,
  { position, services }: Pick<SavedCategory, "position" | "services">,
  parent?: SavedCategory,
): SavedCategory => ({
  id,
  parent_id: parent?.id ?? null,
  slug,
  title,
  description: null,
  url: parent ? `${parent.url}/${slug}` : `/${slug}`,
  position,
  services,
  reserved_route: false,
  updated_at: "2026-10-26T12:00:00.000Z",
});

const youth = savedCategory("youth", "youth-and-community", "Youth and community", {
  position: 2,
  services: 0,
});

const saved = [
  savedCategory("education", "education", "Education", { position: 0, services: 2 }),
  savedCategory("health", "health", "Health", { position: 1, services: 0 }),
  youth,
  savedCategory("sport", "sport", "Sport", { position: 0, services: 1 }, youth),
  savedCategory("arts", "arts", "Arts", { position: 1, services: 0 }, youth),
];

const services = [
  { category: { slug: "education", title: "Education" } },
  { category: { slug: "education", title: "Education" } },
  { category: { slug: "sport", title: "Sport" } },
];

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

// Reads the content API refuses before it answers
let unavailable = 0;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;

      if (unavailable > 0) {
        unavailable -= 1;

        return new Response(null, { status: 503 });
      }

      return path === "/editor/categories"
        ? Response.json({ categories: saved })
        : Response.json(services);
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  unavailable = 0;
  vi.unstubAllGlobals();
});

/** The screen on a fresh API and cache, as the workspace shows it. */
const render = () =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <CategoriesScreen api={createEditorApi("https://api.example.test")} />
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

const loaded = () => until(() => expect(names()).toHaveLength(saved.length));

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === name || item.textContent === name,
  )!;

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');

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

const submit = () =>
  act(async () => dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

const closed = () => vi.waitFor(() => expect(dialog()).toBeNull());

test("lists each category with its address and services, subcategories under their parent", async () => {
  await render();
  await loaded();

  expect(names()).toEqual(["Education", "Health", "Youth and community", "Sport", "Arts"]);
  expect(rows()[3]!.textContent).toContain("/youth-and-community/sport");
  // Indented a step, and counted where the narrow layout shows it too
  expect(rows()[3]!.querySelector("td div")?.className).toContain("ps-6");
  expect(rows()[0]!.textContent).toContain("2 services");
  expect(host.textContent).toContain("Preview only");
});

test("moves a category among its siblings, keeping the focus and saying where it went", async () => {
  await render();
  await loaded();

  expect(button("Move Education up").disabled).toBe(true);
  expect(button("Move Youth and community down").disabled).toBe(true);
  expect(button("Move Sport up").disabled).toBe(true);
  expect(button("Move Arts down").disabled).toBe(true);

  button("Move Health up").focus();
  await press("Move Health up");

  expect(names()).toEqual(["Health", "Education", "Youth and community", "Sport", "Arts"]);
  // Tinted in its new place, so a pointer can follow it there
  expect(rows()[0]!.className).toContain("bg-blue-10");
  // At the top, up can't move it further, so down keeps the focus
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Health down"),
  );
  expect(said()).toContain("Health moved up: 1 of 3");

  // A subcategory moves only among its parent's subcategories
  await press("Move Arts up");
  expect(names()).toEqual(["Health", "Education", "Youth and community", "Arts", "Sport"]);
  // Only the last row moved is tinted
  expect(tinted()).toEqual(["Arts"]);
  // Read back, the order stays
  await vi.waitFor(() =>
    expect(names()).toEqual(["Health", "Education", "Youth and community", "Arts", "Sport"]),
  );
});

test("the tint stays on through a run of moves, and clears two seconds after the last", async () => {
  await render();
  await loaded();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  try {
    const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    await press("Move Health up");
    await wait(1500);
    await press("Move Health down");
    // Past the first move's two seconds, the second move's tint holds
    await wait(600);
    expect(tinted()).toEqual(["Health"]);
    await wait(1400);
    expect(tinted()).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test("rapid moves survive a delayed background count refresh", async () => {
  await render();
  await loaded();
  const started = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();

  vi.stubGlobal("fetch", async () => {
    started.resolve();
    await pending.promise;

    return Response.json(services);
  });

  let refreshing: Promise<void>;

  await act(async () => {
    refreshing = client.refetchQueries({ queryKey: ["content", "categories"] });
  });
  await started.promise;
  await press("Move Youth and community up");
  await press("Move Youth and community up");
  await press("Move Arts up");

  const ordered = ["Youth and community", "Arts", "Sport", "Education", "Health"];

  await until(() => expect(names()).toEqual(ordered));
  await act(async () => {
    pending.resolve();
    await refreshing;
  });
  await until(() => expect(client.isFetching()).toBe(0));
  expect(names()).toEqual(ordered);
  expect(said()).toContain("Arts moved up: 1 of 2");
});

test("adds a category whose slug follows its name, after its parent's other subcategories", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Dance & movement");

  expect(control("Slug").value).toBe("dance-movement");

  await enter("Parent category", "youth");

  expect(dialog()?.textContent).toContain("/youth-and-community/dance-movement");

  await submit();
  await closed();
  await vi.waitFor(() => expect(names()).toContain("Dance & movement"));
  expect(names()).toEqual([
    "Education",
    "Health",
    "Youth and community",
    "Sport",
    "Arts",
    "Dance & movement",
  ]);
});

test("a field's problem shows on it, which takes the focus", async () => {
  await render();
  await loaded();
  await press("Add category");
  await enter("Name", "Schools");
  await enter("Slug", "education");
  await submit();

  expect(dialog()?.textContent).toContain("Another category already uses this slug");
  expect(document.activeElement).toBe(control("Slug"));
  expect(control("Slug").getAttribute("aria-invalid")).toBe("true");
});

test("edits a category, and a parent's new slug moves its subcategories' addresses", async () => {
  await render();
  await loaded();
  await press("Edit Youth and community");

  // It has subcategories, so it can't become one
  expect(control("Parent category").disabled).toBe(true);

  await enter("Name", "Youth");
  await enter("Slug", "youth");
  await submit();
  await closed();
  await vi.waitFor(() => expect(names()).toContain("Youth"));
  expect(rows()[3]!.textContent).toContain("/youth/sport");
});

test("won't delete a category with services filed under it, and links to them", async () => {
  await render();
  await loaded();
  await press("Delete Education");

  expect(dialog()?.getAttribute("role")).toBe("dialog");
  expect(dialog()?.textContent).toContain(
    "2 services are filed under Education. Move them to another category first.",
  );
  expect(dialog()?.querySelector("a")?.getAttribute("href")).toBe("/services?category=Education");
  // Nothing to confirm, so no Delete button, greyed or not
  expect(button("Delete category")).toBeUndefined();
  await press("Close");
  await closed();
});

test("a renamed category links to the services under its real API name", async () => {
  await render();
  await loaded();
  await press("Edit Education");
  await enter("Name", "Schools");
  await submit();
  await closed();
  await until(() => expect(names()).toContain("Schools"));
  await press("Delete Schools");

  expect(dialog()?.textContent).toContain("2 services are filed under Schools");
  expect(dialog()?.querySelector("a")?.getAttribute("href")).toBe("/services?category=Education");
});

test("Create service offers only the saved categories, whatever the preview changes", async () => {
  const api = createEditorApi("https://api.example.test");

  // One API and one query cache for the screen and the picker, as in the workspace
  const show = (picker: boolean) =>
    act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <QueryClientProvider client={client}>
            <CategoriesScreen api={api} />
            {picker && <CreateRemoteServiceDialog api={api} close={() => {}} done={() => {}} />}
          </QueryClientProvider>
        </RouterContextProvider>,
      ),
    );

  const choices = () => [...document.querySelectorAll<HTMLOptionElement>('[role="dialog"] option')];

  const preview = ["Schools", "Health", "Youth and community", "Sport", "Arts", "Housing"];

  await show(false);
  await loaded();
  await press("Add category");
  await enter("Name", "Housing");
  await submit();
  await closed();
  await press("Edit Education");
  await enter("Name", "Schools");
  await submit();
  await closed();
  await until(() => expect(names()).toEqual(preview));

  await show(true);
  await until(() =>
    expect(choices().map((choice) => choice.value)).toEqual([
      "",
      ...saved.map((category) => category.id),
    ]),
  );
  expect(choices().find((choice) => choice.value === "education")?.textContent).toBe("Education");
  // Nor does the picker's read replace the preview
  expect(names()).toEqual(preview);
});

test("keeps the list with a warning when a refresh fails, and retries", async () => {
  await render();
  await loaded();

  unavailable = 1;
  await act(async () => client.invalidateQueries({ queryKey: ["content", "categories"] }));

  expect(names()).toHaveLength(saved.length);
  await until(() =>
    expect(host.textContent).toContain(
      "We could not refresh categories. Showing the last loaded list.",
    ),
  );

  await press("Try again");
  await until(() => expect(host.textContent).not.toContain("We could not refresh categories"));
  expect(names()).toHaveLength(saved.length);
});

test.each([
  [401, "Your session has ended"],
  [403, "You do not have access"],
])("shows a %i refresh refusal even with cached categories", async (status, message) => {
  await render();
  await loaded();

  vi.stubGlobal("fetch", async () => new Response(null, { status }));
  await act(async () => client.invalidateQueries({ queryKey: ["content", "categories"] }));

  await until(() => expect(host.textContent).toContain(message));
  expect(rows()).toHaveLength(0);

  if (status === 401) {
    const link = host.querySelector("a");

    expect(link?.textContent).toBe("Sign in again");
    expect(link?.getAttribute("href")).toContain("returnTo=%2Fcategories");
  } else expect(button("Try again")).toBeDefined();
});

test("deletes a category nothing is filed under", async () => {
  await render();
  await loaded();
  await press("Delete Health");
  await press("Delete category");
  await closed();
  await vi.waitFor(() => expect(names()).not.toContain("Health"));
  expect(document.activeElement?.textContent).toBe("Add category");
});

test("says when the categories couldn't load, and loads them on Try again", async () => {
  unavailable = 1;
  await render();
  await vi.waitFor(() => expect(host.textContent).toContain("We could not load categories"));
  // The loading status outlives the failure, so a retry is a change to a live region already there
  const status = host.querySelector('p[role="status"].sr-only')!;
  const answer = globalThis.fetch;
  const held = Promise.withResolvers<void>();

  expect(status.textContent).toBe("");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    await held.promise;

    return answer(input);
  });
  await press("Try again");
  await vi.waitFor(() => expect(status.textContent).toBe("Loading categories…"));
  expect(status.isConnected).toBe(true);
  await act(async () => held.resolve());
  await loaded();
  expect(status.textContent).toBe("");
});
