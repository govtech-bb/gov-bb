/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi } from "../../src/api/client";
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
