/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { SmartToolEditor } from "./tool";
import { draftKeyFor, readDraft, writeDraft } from "./-draft-store";
import type { LoadedSmartTool } from "./-tools-server";

const server = vi.hoisted(() => ({ load: vi.fn(), publish: vi.fn() }));
vi.mock("./-tools-server", () => ({
  loadSmartTool: server.load,
  publishSmartTool: server.publish,
}));
vi.mock("./-use-theme", () => ({ useTheme: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("./-tool-preview", () => ({
  ToolPreview: ({ content }: { content: unknown }) => (
    <output aria-label="Draft preview">{JSON.stringify(content)}</output>
  ),
}));

const loaded: LoadedSmartTool = {
  id: "pharmacies",
  revision: { source: "base", sha: "one" },
  canPublish: true,
  content: {
    schemaVersion: 1,
    lastUpdated: "2026-09-09",
    copy: { title: "Find an open pharmacy" },
    pharmacies: [
      {
        slug: "cs",
        name: "C S Pharmacy",
        parish: "St. Michael",
        type: "private",
        pppStatus: "participating",
        phone: "1111111",
      },
      {
        slug: "second",
        name: "Second pharmacy",
        parish: "St. James",
        type: "private",
        pppStatus: "unconfirmed",
      },
    ],
  },
};
const key = draftKeyFor("smart-tool:pharmacies:1");
function pharmacy() {
  fireEvent.change(screen.getByLabelText("Content section"), {
    target: { value: "pharmacies" },
  });
  fireEvent.click(screen.getByRole("button", { name: "C S Pharmacy" }));
}
function phone() {
  pharmacy();
  fireEvent.change(screen.getByLabelText("Phone (optional)"), {
    target: { value: "2222222" },
  });
}
beforeEach(() => {
  localStorage.clear();
  server.load.mockReset();
  server.publish.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("autosaves labelled edits, keeps sibling records and sends the prepared draft to preview", () => {
  const first = render(<SmartToolEditor loaded={loaded} />);
  phone();
  act(() => vi.advanceTimersByTime(350));
  expect(screen.getByLabelText("Draft preview").textContent).toContain(
    "2222222",
  );
  expect(screen.getByLabelText("Draft preview").textContent).toContain(
    "Second pharmacy",
  );
  first.unmount();
  render(<SmartToolEditor loaded={loaded} />);
  pharmacy();
  expect(
    (screen.getByLabelText("Phone (optional)") as HTMLInputElement).value,
  ).toBe("2222222");
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(screen.getByText("Pharmacies › C S Pharmacy › Phone")).toBeTruthy();
  expect(screen.getByText("Before: 1111111")).toBeTruthy();
  expect(screen.getByText("After: 2222222")).toBeTruthy();
});

it("requires confirmation to remove a record and returns keyboard focus", () => {
  render(<SmartToolEditor loaded={loaded} />);
  pharmacy();
  fireEvent.click(screen.getByRole("button", { name: "Remove pharmacy" }));
  expect(screen.getByLabelText("Draft preview").textContent).toContain(
    "C S Pharmacy",
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(screen.getByLabelText("Draft preview").textContent).not.toContain(
    "C S Pharmacy",
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Find a record"));
  act(() => vi.advanceTimersByTime(350));
  expect(readDraft<{ removals: string[] }>(key)?.removals).toEqual([
    "/pharmacies/cs",
  ]);
});

it("shows named field errors and focuses the error summary", () => {
  render(<SmartToolEditor loaded={loaded} />);
  pharmacy();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(document.activeElement).toBe(screen.getByRole("alert"));
  expect(
    within(screen.getByRole("alert")).getByText(
      /Pharmacies › cs › Name: Enter a value/,
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(server.publish).not.toHaveBeenCalled();
});

it("keeps failed submissions and clears the saved draft only after success", async () => {
  server.publish.mockRejectedValueOnce(new Error("GitHub is unavailable"));
  server.publish.mockResolvedValueOnce({
    status: "success",
    prNumber: 42,
    prUrl: "https://github.com/govtech-bb/gov-bb/pull/42",
  });
  render(<SmartToolEditor loaded={loaded} />);
  phone();
  act(() => vi.advanceTimersByTime(350));
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for publication" }),
    ),
  );
  expect(screen.getByText("GitHub is unavailable")).toBeTruthy();
  expect(readDraft(key)).not.toBeNull();
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for publication" }),
    ),
  );
  act(() => vi.advanceTimersByTime(350));
  expect(readDraft(key)).toBeNull();
  expect(screen.getByText(/It is not live yet/)).toBeTruthy();
});

it("preserves a stale draft while blocking publication", () => {
  writeDraft(key, {
    base: loaded,
    content: { ...loaded.content, lastUpdated: "2026-09-10" },
    removals: [],
  });
  render(
    <SmartToolEditor
      loaded={{ ...loaded, revision: { source: "base", sha: "two" } }}
    />,
  );
  expect(screen.getByText(/A newer source is available/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Submit for publication",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(readDraft(key)).not.toBeNull();
});

it("keeps an edit when leaving immediately, and clears a reverted draft", () => {
  const first = render(<SmartToolEditor loaded={loaded} />);
  phone();
  first.unmount();
  const second = render(<SmartToolEditor loaded={loaded} />);
  pharmacy();
  expect(
    (screen.getByLabelText("Phone (optional)") as HTMLInputElement).value,
  ).toBe("2222222");
  fireEvent.change(screen.getByLabelText("Phone (optional)"), {
    target: { value: "1111111" },
  });
  second.unmount();
  render(<SmartToolEditor loaded={loaded} />);
  pharmacy();
  expect(
    (screen.getByLabelText("Phone (optional)") as HTMLInputElement).value,
  ).toBe("1111111");
  expect(readDraft(key)).toBeNull();
});

it("keeps a new identifier focused while it is typed", () => {
  render(<SmartToolEditor loaded={loaded} />);
  fireEvent.change(screen.getByLabelText("Content section"), {
    target: { value: "pharmacies" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add pharmacy" }));
  const input = screen.getByLabelText("Identifier");
  input.focus();
  fireEvent.change(input, { target: { value: "new" } });
  fireEvent.change(input, { target: { value: "new-pharmacy" } });
  expect(input.isConnected).toBe(true);
  expect(document.activeElement).toBe(input);
  expect((input as HTMLInputElement).value).toBe("new-pharmacy");
});
