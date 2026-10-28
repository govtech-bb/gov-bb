/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi, type ServiceDetail } from "../../src/api/client";
import type { PageDocument } from "../../src/workspace/model";
import {
  CreateRemotePageDialog,
  DeleteRemotePageDialog,
} from "../../src/workspace/remote-page-dialogs";

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
          page={page}
          close={close}
          done={() => {}}
        />
      </QueryClientProvider>,
    ),
  );

  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;

  const button = (name: string) =>
    [...dialog.querySelectorAll("button")].find((item) => item.textContent === name)!;

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
          detail={detail}
          close={() => {}}
          done={() => {}}
        />
      </QueryClientProvider>,
    ),
  );

  // A start page needs no title, so the dialog can be sent as it opens
  const add = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "Add page",
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
