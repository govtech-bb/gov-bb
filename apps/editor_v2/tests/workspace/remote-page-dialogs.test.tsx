/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Category } from "../../src/api/categories";
import { createEditorApi, type ServiceDetail } from "../../src/api/client";
import { categoriesQuery } from "../../src/api/queries";
import type { PageDocument } from "../../src/workspace/model";
import {
  CreateRemotePageDialog,
  CreateRemoteServiceDialog,
  DeleteRemotePageDialog,
} from "../../src/workspace/remote-page-dialogs";
import { shownText } from "../helpers/shown-text";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const page: PageDocument = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Fees",
  kind: "page",
  role: "supporting",
};

test.each(["service", "start", "supporting"] as const)(
  "creating a %s starts in Preview with an empty body",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    const category = {
      id: "category-1",
      parent_id: null,
      slug: "business-trade",
      url: "/business-trade",
      title: "Business and trade",
      description: null,
      position: 0,
      services: 0,
      reserved_route: false,
      last_edited_by: null,
      updated_at: "2026-10-07T12:00:00.000Z",
    };

    const service: ServiceDetail["service"] = {
      id: "22222222-2222-4222-8222-222222222222",
      url: "/business-trade/licence",
      title: "Licence",
      category: { slug: category.slug, title: category.title },
      visibility: "public",
      form_id: null,
      has_start_page: false,
      page_count: 1,
      updated_at: "2026-10-07T12:00:00.000Z",
    };

    const send = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json(
        init?.method === "POST"
          ? { ...JSON.parse(String(init.body)), id: page.id }
          : { categories: [category] },
      ),
    );

    vi.stubGlobal("fetch", send);
    const api = createEditorApi("https://api.example.invalid");
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(categoriesQuery(api).queryKey, [category]);
    const done = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));

    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          {kind === "service" ? (
            <CreateRemoteServiceDialog api={api} open onClose={() => {}} onDone={done} />
          ) : (
            <CreateRemotePageDialog
              api={api}
              detail={{ service, pages: [] }}
              open
              onClose={() => {}}
              onDone={done}
            />
          )}
        </QueryClientProvider>,
      ),
    );
    const form = document.querySelector("form")!;
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("starts in Preview");
    await act(async () => {
      const select = form.querySelector("select")!;
      select.value = kind === "service" ? category.id : kind;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    if (kind !== "start") {
      await act(async () => {
        const input = form.querySelector("input")!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          kind === "service" ? "  Licence  " : "  Fees  ",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    expect(send.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() => expect(done).toHaveBeenCalledWith(page.id));
    const posts = send.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]![1]!.body))).toEqual({
      title: kind === "service" ? "Licence" : kind === "start" ? "Before you start" : "Fees",
      url:
        kind === "service" ? service.url : `${service.url}/${kind === "start" ? "start" : "fees"}`,
      ...(kind === "service" ? { category_id: category.id } : { parent_id: service.id }),
      visibility: "preview",
      body_markdown: "",
    });
    await act(async () => root.unmount());
    client.clear();
  },
);

test("deleting a page asks in an alert dialog, which can't be closed while the page goes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let respond = (_response: Response) => {};

  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
  );
  const close = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <DeleteRemotePageDialog
          api={createEditorApi("https://api.example.invalid")}
          open
          page={page}
          onClose={close}
          onDone={() => {}}
        />
      </QueryClientProvider>,
    ),
  );

  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;

  const button = (name: string) =>
    [...dialog.querySelectorAll("button")].find((item) => shownText(item) === name)!;

  expect(dialog.textContent).toContain("Delete this page?");
  await act(async () => button("Delete page").click());
  // The mutation reports pending on its own schedule, so wait for the button to say so
  await vi.waitFor(() =>
    expect(button("Deleting page…").getAttribute("aria-disabled")).toBe("true"),
  );
  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(close).not.toHaveBeenCalled();

  // It fails: the dialog stays, with the reason, and the page can be deleted again
  await act(async () => respond(new Response(null, { status: 500 })));
  await vi.waitFor(() =>
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      "The page could not be deleted. Try again.",
    ),
  );
  expect(button("Delete page").getAttribute("aria-disabled")).toBeNull();

  // Refused: the API's own reason, since trying again won't help
  await act(async () => button("Delete page").click());
  await act(async () =>
    respond(
      Response.json(
        { error: "forbidden", message: "Only approvers can change who can see a page." },
        { status: 403 },
      ),
    ),
  );
  await vi.waitFor(() =>
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      "Only approvers can change who can see a page.",
    ),
  );
  await act(async () => root.unmount());
});

test("adding a page the API refuses (403) shows the API's reason", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: "forbidden",
          message: "You need the editor role to make changes. Ask an admin to grant it.",
        },
        { status: 403 },
      ),
    ),
  );

  const detail: ServiceDetail = {
    service: {
      id: "service",
      title: "API service",
      url: "/family/service",
      category: { slug: "family", title: "Family" },
      visibility: "draft",
      form_id: null,
      has_start_page: false,
      page_count: 1,
      updated_at: "2026-10-28T00:00:00.000Z",
    },
    pages: [],
  };

  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <CreateRemotePageDialog
          api={createEditorApi("https://api.example.invalid")}
          open
          detail={detail}
          onClose={() => {}}
          onDone={() => {}}
        />
      </QueryClientProvider>,
    ),
  );

  // A start page needs no title, so the dialog can be sent as it opens
  const add = [...document.querySelectorAll("button")].find(
    (item) => shownText(item) === "Add page",
  )!;

  await act(async () => add.click());
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "You need the editor role to make changes. Ask an admin to grant it.",
    ),
  );
  expect(document.body.textContent).not.toContain("The page could not be created");
  await act(async () => root.unmount());
});

test("a service on its way can't be cancelled, so none is made after the author has let it go", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const family: Category = {
    id: "00000000-0000-4000-8000-000000000099",
    parent_id: null,
    slug: "family",
    title: "Family",
    description: null,
    url: "/family",
    position: 0,
    services: 0,
    reserved_route: false,
    last_edited_by: null,
    updated_at: "2026-10-28T12:00:00.000Z",
  };

  const created = Promise.withResolvers<Response>();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "POST" ? created.promise : Response.json({ categories: [family] }),
    ),
  );

  const close = vi.fn();
  const done = vi.fn();
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <CreateRemoteServiceDialog
          api={createEditorApi("https://api.example.invalid")}
          open
          onClose={close}
          onDone={done}
        />
      </QueryClientProvider>,
    ),
  );

  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;

  const button = (name: string) =>
    [...dialog.querySelectorAll("button")].find(
      (item) => shownText(item) === name || item.getAttribute("aria-label") === name,
    )!;

  // Types or chooses as a browser would: React reads the new value from the event
  const enter = (field: HTMLInputElement | HTMLSelectElement, value: string) =>
    act(async () => {
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;

      Object.getOwnPropertyDescriptor(prototype.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(
        new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    });

  const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  await vi.waitFor(() =>
    expect(dialog.querySelector("option[value]:not([value=''])")).not.toBeNull(),
  );
  await enter(dialog.querySelector("input")!, "Register a birth");
  await enter(dialog.querySelector("select")!, family.id);
  expect(shownText(submit)).toBe("Create service");
  await act(async () => submit.click());
  await vi.waitFor(() => expect(shownText(submit)).toBe("Creating service…"));

  // Cancel, the close button and Esc all wait for the answer
  expect(button("Cancel").disabled).toBe(true);
  expect(button("Close").disabled).toBe(true);
  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(close).not.toHaveBeenCalled();

  await act(async () => created.resolve(Response.json({ id: "register-a-birth" })));
  await vi.waitFor(() => expect(done).toHaveBeenCalledWith("register-a-birth"));
  expect(close).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
