/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LinkAtCaret } from "./link-at-caret";

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

const popover = () => document.querySelector<HTMLElement>('[role="dialog"]');

const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

function Demo({ onRemove }: { onRemove?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("/travel/passport-fees");

  return (
    <LinkAtCaret
      anchor={host}
      url={url}
      editing={editing}
      onEditingChange={setEditing}
      onRemove={onRemove}
      onClose={() => setEditing(false)}
      toAddress={(typed) => typed.trim() || null}
      onApply={(next) => {
        setUrl(next);
        setEditing(false);
      }}
    />
  );
}

test("shows where the link goes, with Edit and Remove, and leaves the focus in the text", async () => {
  const removed = vi.fn();
  await act(async () => root.render(<Demo onRemove={removed} />));

  expect(popover()?.getAttribute("aria-label")).toBe("Link");
  expect(popover()?.textContent).toContain("/travel/passport-fees");
  expect(popover()?.contains(document.activeElement)).toBe(false);
  await act(async () => button("Remove link").click());
  expect(removed).toHaveBeenCalledOnce();

  await act(async () => button("Edit link").click());
  const field = document.querySelector<HTMLInputElement>('input[aria-label="Link"]')!;
  expect(field.value).toBe("/travel/passport-fees");
  expect(document.activeElement).toBe(field);
});

test("a button without an address of its own says where it goes instead, and has no Remove", async () => {
  await act(async () =>
    root.render(
      <LinkAtCaret
        anchor={host}
        fallback="Linked form"
        label="Button destination"
        editing={false}
        onEditingChange={() => {}}
        onClose={() => {}}
        toAddress={() => null}
        onApply={() => {}}
      />,
    ),
  );

  expect(popover()?.textContent).toContain("Linked form");
  expect(button("Remove link")).toBeNull();
});
