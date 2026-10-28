/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
import { apiPageSchema, PageEditLockToken } from "../../src/api/page-schemas";
import { pageToMarkdown } from "../../src/api/page-markdown";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import type { PageSession } from "../../src/workspace/page-sync";
import type { PageDocument } from "../../src/workspace/model";
import { DeleteRemotePageDialog } from "../../src/workspace/remote-page-dialogs";

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

const baselinePage = apiPageSchema.parse({
  id: page.id,
  version: 7,
  title: page.title,
  url: "/fees",
  slug: "fees",
  category_id: null,
  parent_id: null,
  description: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "Fees",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
});

const token = PageEditLockToken.parse("33333333-3333-4333-8333-333333333333");

if (!token) throw new Error("Invalid test credential");

const markdown = pageToMarkdown(baselinePage, []);

const session: PageSession = {
  store: new DraftStore(markdown, govbbPageCodec),
  getBaseline: () => ({ page: baselinePage, markdown }),
  getEditLockToken: () => token,
  isSaving: () => false,
};

test("deleting retains the reviewed version and requires reconciliation after an uncertain response", async () => {
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
          session={session}
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

  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
    `https://api.example.invalid/pages/${page.id}?version=7`,
  );
  // An uncertain result retains this confirmation; it must not fetch a fresh version and retry deletion.
  await act(async () => respond(new Response(null, { status: 500 })));
  await vi.waitFor(() =>
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      "The server may have completed this request. Cancel and check the saved pages before trying again. Your open working copy is unchanged.",
    ),
  );
  expect(button("Delete page").disabled).toBe(true);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  await act(async () => root.unmount());
});
