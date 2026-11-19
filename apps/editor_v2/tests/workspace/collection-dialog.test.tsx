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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
import { FIELD_TYPES } from "../../src/api/field-types";
import { collectionQuery } from "../../src/api/queries";
import { CollectionsScreen } from "../../src/workspace/collections";
import {
  collectionProblems,
  newCollectionInput,
  type CollectionDraft,
} from "../../src/workspace/collections/new-collection";
import { Toaster } from "../../src/ui/toast";

const CONTACTS = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: { fields: [{ key: "key", label: "Key", type: "slug" }] },
  schema_version: 1,
  updated_at: "2026-11-19T12:00:00.000Z",
  record_count: 0,
};

type Answer = { status: number; body: unknown } | "lost";

/**
 * api_v2's collection list, its create route and its collection read. A create answers with `answers`' next entry
 * ("lost": no answer reaches the browser), or else as api_v2 does for a definition it takes. A read finds what
 * `stored` holds under that key, or 404s.
 */
function contentApi() {
  const posts: unknown[] = [];
  const answers: Answer[] = [];
  const stored = new Map<string, unknown>();
  const reads: string[] = [];

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;

    if (path === "/collections" && (init?.method ?? "GET") === "GET")
      return Response.json({ collections: [CONTACTS] });

    if (path === "/collections" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));

      posts.push(body);
      const answer = answers.shift();

      if (answer === "lost") throw new TypeError("Failed to fetch");

      return answer
        ? Response.json(answer.body, { status: answer.status })
        : Response.json(
            { ...body, schema_version: 1, updated_at: "2026-11-19T12:01:00.000Z" },
            { status: 201 },
          );
    }

    const read = /^\/collections\/([^/]+)\/records$/.exec(path)?.[1];

    if (read) {
      reads.push(read);
      const collection = stored.get(read);

      return collection
        ? Response.json({ collection, records: [] })
        : Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  });

  return {
    fetch,
    posts,
    reads,
    answer: (next: Answer) => void answers.push(next),
    /** A collection api_v2 holds under its key, as a later read finds it. */
    store: (collection: { key: string }) => void stored.set(collection.key, collection),
  };
}

const rootRoute = createRootRoute();

let router: ReturnType<typeof makeRouter>;

function makeRouter() {
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/collections" }),
      createRoute({ getParentRoute: () => rootRoute, path: "/collections/$key" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/collections"] }),
  });
}

let host: HTMLDivElement;

let root: Root;

let client: QueryClient;

let server: ReturnType<typeof contentApi>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server = contentApi();
  vi.stubGlobal("fetch", server.fetch);
  router = makeRouter();
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

const api = createEditorApi("https://api.example.test");

const mount = (props: { readOnly?: boolean; why?: string } = {}) =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <CollectionsScreen api={api} {...props} />
          <Toaster />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  );

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

// A button's words, without the hidden pending label it keeps for its width
const spoken = (item: Element) => {
  // SAFETY: A deep clone of an Element is an Element.
  const copy = item.cloneNode(true) as Element;

  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());

  return copy.textContent;
};

const buttons = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (item) => item.getAttribute("aria-label") === name || spoken(item) === name,
  );

const press = (name: string) => act(async () => buttons(name)[0]!.click());

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/** The controls labelled `label` in the dialog, in order: each field row has its own Key, Label and Type. */
const controls = (label: string) =>
  [...(dialog()?.querySelectorAll("label") ?? [])].flatMap((item) => {
    const found = item.textContent === label ? document.getElementById(item.htmlFor) : null;

    return found instanceof HTMLInputElement || found instanceof HTMLSelectElement ? [found] : [];
  });

const control = (label: string, index = 0) => {
  const found = controls(label)[index];

  if (!found) throw new Error(`No control ${index} is labelled ${label}`);

  return found;
};

/** A labelled select's options. */
const options = (label: string) => {
  const found = control(label);

  if (!(found instanceof HTMLSelectElement)) throw new Error(`${label} is not a select`);

  return [...found.options];
};

/** The error shown with a control, which marks it invalid and is read out with it. */
const errorOf = (field: HTMLElement) => {
  const error = (field.getAttribute("aria-describedby")?.split(" ") ?? [])
    .map((id) => document.getElementById(id))
    .find((item) => item?.classList.contains("text-error"));

  if (!error) return undefined;
  expect(field.getAttribute("aria-invalid")).toBe("true");

  return error.textContent;
};

const enter = (field: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(async () => {
    const prototype =
      field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;

    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });

const submit = () =>
  act(async () => dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

const opened = async () => {
  await mount();
  await until(() => expect(host.querySelector("tbody a")).not.toBeNull());
  await press("Add collection");
  await until(() => expect(dialog()?.querySelector("input")).toBeTruthy());
};

describe("the new collection's checks", () => {
  const draft: CollectionDraft = {
    title: "  Branch offices ",
    fields: [
      { id: 0, key: " key ", label: "Key", type: "slug" },
      { id: 1, key: "name", label: " Name ", type: "text" },
    ],
    recordKey: 0,
  };

  test("sends the key its title makes until one is typed, without the spaces around its words", () => {
    expect(newCollectionInput(draft)).toEqual({
      key: "branch-offices",
      title: "Branch offices",
      record_key: "key",
      schema: {
        fields: [
          { key: "key", label: "Key", type: "slug" },
          { key: "name", label: "Name", type: "text" },
        ],
      },
    });
    expect(newCollectionInput({ ...draft, key: "offices" }).key).toBe("offices");
    expect(collectionProblems(newCollectionInput(draft), ["contacts"])).toEqual([]);
  });

  test.each([
    ["a key another collection has", { key: "contacts" }, "key"],
    ["a key in the wrong format", { key: "Branch Offices" }, "key"],
    ["no title", { title: " ", key: "offices" }, "title"],
    ["no fields", { fields: [], recordKey: undefined }, "schema.fields"],
    [
      "two fields with one key",
      {
        fields: [
          { id: 0, key: "key", label: "Key", type: "slug" },
          { id: 1, key: "key", label: "Name", type: "text" },
        ],
      },
      "schema.fields.1.key",
    ],
    [
      "a field without a label",
      {
        fields: [
          { id: 0, key: "key", label: "Key", type: "slug" },
          { id: 1, key: "name", label: "", type: "text" },
        ],
      },
      "schema.fields.1.label",
    ],
    ...["__proto__", "has space", "phone,email"].map(
      (key) =>
        [
          `a field key in the wrong format (${key})`,
          {
            fields: [
              { id: 0, key: "key", label: "Key", type: "slug" },
              { id: 1, key, label: "Odd", type: "text" },
            ],
          },
          "schema.fields.1.key",
        ] as const,
    ),
    ["no record key", { recordKey: undefined }, "record_key"],
    ["a record key that isn't a slug field", { recordKey: 1 }, "record_key"],
  ] as const)("finds %s, naming the field as api_v2 does", (_, change, field) => {
    expect(
      collectionProblems(newCollectionInput({ ...draft, ...change }), ["contacts"]).map(
        (problem) => problem.field,
      ),
    ).toEqual([field]);
  });
});

test("offers every field type api_v2 lists, in its order", async () => {
  await opened();

  expect(options("Type").map((option) => option.value)).toEqual(
    FIELD_TYPES.map(({ type }) => type),
  );
  expect(FIELD_TYPES.map(({ type }) => type)).toEqual(["text", "slug", "email"]);
});

test("adds a collection with its fields and record key, then opens it to take its first record", async () => {
  await opened();

  await enter(control("Title"), "Branch offices");
  // The key follows the title until one is typed
  expect(control("Key").value).toBe("branch-offices");
  await enter(control("Key"), "offices");

  await press("Add field");
  // The new field's key takes the focus
  expect(document.activeElement).toBe(control("Key", 2));
  await enter(control("Key", 2), "name");
  await enter(control("Label", 1), "Name");
  await press("Add field");
  await enter(control("Key", 3), "email");
  await enter(control("Label", 2), "Email");
  await enter(control("Type", 2), "email");
  expect(options("Record key").map((option) => option.text)).toEqual([
    "Choose a slug field",
    "Key (key)",
  ]);

  await submit();
  await until(() => expect(router.state.location.pathname).toBe("/collections/offices"));

  expect(server.posts).toEqual([
    {
      key: "offices",
      title: "Branch offices",
      record_key: "key",
      schema: {
        fields: [
          { key: "key", label: "Key", type: "slug" },
          { key: "name", label: "Name", type: "text" },
          { key: "email", label: "Email", type: "email" },
        ],
      },
    },
  ]);
  await until(() => expect(document.body.textContent).toContain("Collection added"));
  // Its screen opens on the definition just added, with no records, without waiting for a read
  expect(client.getQueryData(collectionQuery(api, "offices").queryKey)).toEqual({
    collection: expect.objectContaining({ key: "offices", title: "Branch offices" }),
    records: [],
  });
});

test("a problem the dialog finds shows on its field, which takes the focus, and nothing is sent", async () => {
  await opened();

  await enter(control("Label"), "");
  await submit();

  expect(server.posts).toEqual([]);
  expect(errorOf(control("Title"))).toBe("Enter a title");
  expect(errorOf(control("Label"))).toBe("Enter a label");
  expect(document.activeElement).toBe(control("Title"));

  // Typing in a field drops its problem, and leaves the focus where it is
  await enter(control("Title"), "Offices");
  expect(errorOf(control("Title"))).toBeUndefined();
  expect(errorOf(control("Label"))).toBe("Enter a label");
});

test("a field api_v2 refuses shows its reason on that field", async () => {
  await opened();
  await enter(control("Title"), "Offices");
  await press("Add field");
  await enter(control("Key", 2), "count");
  await enter(control("Label", 1), "Count");
  server.answer({
    status: 422,
    body: {
      error: "validation_failed",
      message: "Choose one of text, slug, email.",
      errors: [{ field: "schema.fields.1.type", message: "Choose one of text, slug, email." }],
    },
  });

  await submit();

  await until(() => expect(errorOf(control("Type", 1))).toBe("Choose one of text, slug, email."));
  expect(document.activeElement).toBe(control("Type", 1));
  expect(router.state.location.pathname).toBe("/collections");
});

test("a key another collection took meanwhile shows on Key", async () => {
  await opened();
  await enter(control("Title"), "Offices");
  server.answer({
    status: 409,
    body: {
      error: "collection_exists",
      message: "There is already a collection offices.",
      errors: [{ field: "key", message: "There is already a collection offices." }],
    },
  });

  await submit();

  await until(() =>
    expect(errorOf(control("Key"))).toBe("Another collection already has this key"),
  );
  expect(document.activeElement).toBe(control("Key"));
});

test("a refusal for want of a role says so", async () => {
  await opened();
  await enter(control("Title"), "Offices");
  server.answer({
    status: 403,
    body: { error: "forbidden", message: "You need the admin or approver role to do this." },
  });

  await submit();

  await until(() =>
    expect(dialog()?.textContent).toContain("You need the admin or approver role to do this."),
  );
});

test("removing a field gives the focus to Add field, and a removed record key must be chosen again", async () => {
  await opened();
  await enter(control("Title"), "Offices");
  await press("Remove field 1");

  expect(controls("Label")).toEqual([]);
  expect(document.activeElement).toBe(buttons("Add field")[0]);
  await submit();
  expect(server.posts).toEqual([]);
  // With no field to mark, Add field takes the focus, the problem read out with it
  const addField = buttons("Add field")[0]!;

  expect(document.activeElement).toBe(addField);
  expect(
    document.getElementById(addField.getAttribute("aria-describedby") ?? "")?.textContent,
  ).toBe("Add at least one field");
});

test("someone who is neither an admin nor an approver can't add a collection, and is told why", async () => {
  await mount({ readOnly: true, why: "Only admins and approvers can add collections." });
  await until(() => expect(host.querySelector("tbody a")).not.toBeNull());

  expect(buttons("Add collection")[0]!.disabled).toBe(true);
  expect(host.textContent).toContain("Only admins and approvers can add collections.");
});

describe("a create whose answer was lost", () => {
  const OFFICES = {
    key: "offices",
    title: "Offices",
    record_key: "key",
    schema: { fields: [{ key: "key", label: "Key", type: "slug" }] },
    schema_version: 1,
    updated_at: "2026-11-19T12:01:00.000Z",
  };

  const lose = async () => {
    await opened();
    await enter(control("Title"), "Offices");
    server.answer("lost");
    await submit();
  };

  test("is checked first, and counts as added when api_v2 holds exactly this collection", async () => {
    server.store(OFFICES);
    await lose();

    await until(() => expect(router.state.location.pathname).toBe("/collections/offices"));
    expect(server.posts).toHaveLength(1);
    expect(server.reads).toContain("offices");
  });

  test("leaves the dialog unsettled, its fields locked, until Check again settles it", async () => {
    await lose();

    // A 404 read-back proves nothing either way
    await until(() => expect(buttons("Check again")).toHaveLength(1));
    expect(dialog()?.textContent).toContain("We couldn’t tell whether the collection was added.");
    expect(control("Title").matches(":disabled")).toBe(true);
    expect(buttons("Add field")[0]!.matches(":disabled")).toBe(true);
    expect(router.state.location.pathname).toBe("/collections");

    // Check again reads first; finding nothing, it resends exactly what was sent, which lands
    await press("Check again");
    await until(() => expect(router.state.location.pathname).toBe("/collections/offices"));
    expect(server.posts).toHaveLength(2);
    expect(server.posts[1]).toEqual(server.posts[0]);
  });

  test.each([
    ["title", { title: "Someone else’s offices" }],
    [
      "record key",
      { record_key: "code", schema: { fields: [{ key: "code", label: "Code", type: "slug" }] } },
    ],
    ["fields", { schema: { fields: [{ key: "key", label: "Office key", type: "slug" }] } }],
  ])(
    "isn't ours when api_v2 holds a collection under its key with another %s: it's sent again and refused on Key",
    async (_, change) => {
      server.store({ ...OFFICES, ...change });
      await lose();
      await until(() => expect(buttons("Check again")).toHaveLength(1));

      server.answer({
        status: 409,
        body: {
          error: "collection_exists",
          message: "There is already a collection offices.",
          errors: [{ field: "key", message: "There is already a collection offices." }],
        },
      });
      await press("Check again");

      await until(() =>
        expect(errorOf(control("Key"))).toBe("Another collection already has this key"),
      );
      expect(server.posts).toHaveLength(2);
      expect(router.state.location.pathname).toBe("/collections");
    },
  );
});
