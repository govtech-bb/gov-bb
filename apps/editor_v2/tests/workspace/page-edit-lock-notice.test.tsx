/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { pageEditLockGenerationSchema, pageEditLockStatusSchema } from "../../src/api/page-schemas";
import type {
  IPageEditLockSession,
  PageEditLockState,
} from "../../src/workspace/page-edit-lock-session";
import { PageEditLockNotice } from "../../src/workspace/page-edit-lock-notice";
import { shownText } from "../helpers/shown-text";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const status = pageEditLockStatusSchema.parse({
  state: "held",
  lockGeneration: 3,
  serverTime: "2026-10-28T12:10:00.000Z",
  holderName: "Another editor",
  ownedByCaller: true,
  lockExpiresAt: "2026-10-28T12:12:00.000Z",
  lastActivityAt: "2026-10-28T12:00:00.000Z",
  idlePromptAt: "2026-10-28T12:10:00.000Z",
  idleExpiresAt: "2026-10-28T12:12:00.000Z",
  activitySequence: 4,
});

if (status.state !== "held") throw new Error("Expected a held lock");

const session = () => ({
  stopEditing: vi.fn<IPageEditLockSession["stopEditing"]>(),
  continueEditing: vi.fn<IPageEditLockSession["continueEditing"]>(),
  takeOver: vi.fn<IPageEditLockSession["takeOver"]>(),
  startEditing: vi.fn<IPageEditLockSession["startEditing"]>(),
  reconcile: vi.fn<IPageEditLockSession["reconcile"]>(),
  getSnapshot: vi.fn<IPageEditLockSession["getSnapshot"]>(),
  subscribe: vi.fn<IPageEditLockSession["subscribe"]>(),
  activate: vi.fn<IPageEditLockSession["activate"]>(),
  deactivate: vi.fn<IPageEditLockSession["deactivate"]>(),
  markUnconfirmed: vi.fn<IPageEditLockSession["markUnconfirmed"]>(),
  recordActivity: vi.fn<IPageEditLockSession["recordActivity"]>(),
  getEditLockToken: vi.fn<IPageEditLockSession["getEditLockToken"]>(),
});

type FakeSession = ReturnType<typeof session>;

/** A page with a field that had focus before the notice, and the editor's own fallback. */
function Page({
  state,
  lock,
  field = true,
}: {
  state: PageEditLockState;
  lock: FakeSession;
  field?: boolean;
}): ReactNode {
  return (
    <>
      {field && <textarea aria-label="Body" />}
      <textarea aria-label="Page title" />
      <PageEditLockNotice
        session={lock satisfies IPageEditLockSession}
        state={state}
        signIn={null}
        recovery={null}
        pageFocus={() => document.querySelector<HTMLElement>('[aria-label="Page title"]')!}
      />
    </>
  );
}

const render = (node: ReactNode) => act(async () => root.render(node));

const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

const button = (name: string, within: ParentNode = document) =>
  [...within.querySelectorAll("button")].find((item) => shownText(item) === name);

const idle: PageEditLockState = { kind: "awaiting-idle-response", status, responding: false };

test("the idle question starts on the safe answer and Escape never stops editing", async () => {
  const lock = session();
  await render(<Page state={{ kind: "editable", status }} lock={lock} />);
  await render(<Page state={idle} lock={lock} />);

  await vi.waitFor(() => expect(document.activeElement).toBe(button("I'm still editing")));
  // What happens to unsaved work if they stop is said before they choose
  expect(dialog()?.textContent).toContain("download any changes you want to keep");

  await act(async () => {
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(lock.stopEditing).not.toHaveBeenCalled();
  expect(dialog()).not.toBeNull();

  await act(async () => button("I'm still editing")!.click());
  expect(lock.continueEditing).toHaveBeenCalledOnce();
  expect(lock.stopEditing).not.toHaveBeenCalled();
});

test("a pending answer can't be sent twice", async () => {
  const lock = session();
  await render(<Page state={{ ...idle, responding: true }} lock={lock} />);

  await act(async () => button("Confirming ownership…")!.click());
  expect(lock.continueEditing).not.toHaveBeenCalled();
});

test("once the idle question is answered, focus goes back where it was", async () => {
  const lock = session();
  await render(<Page state={{ kind: "editable", status }} lock={lock} />);
  const body = document.querySelector<HTMLElement>('[aria-label="Body"]')!;
  await act(async () => body.focus());
  await render(<Page state={idle} lock={lock} />);
  await vi.waitFor(() => expect(document.activeElement).toBe(button("I'm still editing")));

  await render(<Page state={{ kind: "lock-lost", reason: "expired" }} lock={lock} />);
  await vi.waitFor(() => expect(document.activeElement).toBe(body));
  // Stopping, or losing the lock, explains how to keep the work before editing again
  expect(host.textContent).toContain("download any changes you want to keep");
});

test("if the field it came from has gone, focus lands on the page rather than nowhere", async () => {
  const lock = session();
  await render(<Page state={{ kind: "editable", status }} lock={lock} />);
  await act(async () => document.querySelector<HTMLElement>('[aria-label="Body"]')!.focus());
  await render(<Page state={idle} lock={lock} />);
  await vi.waitFor(() => expect(document.activeElement).toBe(button("I'm still editing")));

  await render(<Page state={{ kind: "editable", status }} lock={lock} field={false} />);
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Page title"),
  );
});

test("taking over confirms the reviewed holder, then leaves focus on the page, not the gone button", async () => {
  const lock = session();
  const locked: PageEditLockState = { kind: "locked-by-another-session", status };
  // As the real session does, taking over publishes the acquisition at once, removing the banner's button
  lock.takeOver.mockImplementation(() => {
    void render(<Page state={{ kind: "acquiring-lock" }} lock={lock} />);
  });
  await render(<Page state={locked} lock={lock} />);

  await act(async () => button("Take over editing")!.focus());
  await act(async () => button("Take over editing")!.click());
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  await act(async () => button("Take over editing", dialog()!)!.click());
  expect(lock.takeOver).toHaveBeenCalledWith(status.lockGeneration);
  await vi.waitFor(() => expect(dialog()).toBeNull());
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Page title"),
  );
});

test("a takeover question for a holder that has since changed doesn't stay open", async () => {
  const lock = session();
  await render(<Page state={{ kind: "locked-by-another-session", status }} lock={lock} />);
  await act(async () => button("Take over editing")!.click());
  await vi.waitFor(() => expect(dialog()).not.toBeNull());

  await render(
    <Page
      state={{
        kind: "locked-by-another-session",
        status: {
          ...status,
          lockGeneration: pageEditLockGenerationSchema.parse(status.lockGeneration + 1),
        },
      }}
      lock={lock}
    />,
  );
  await vi.waitFor(() => expect(dialog()).toBeNull());
  expect(lock.takeOver).not.toHaveBeenCalled();
});
