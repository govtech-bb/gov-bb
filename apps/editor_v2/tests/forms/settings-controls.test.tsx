/** @vitest-environment jsdom */
import { Copy, Trash } from "@phosphor-icons/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Action } from "../../src/forms/react/settings-controls";
import { Menu } from "../../src/ui/menu";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("a block menu row shows its shortcut as a keycap, and a row without one shows none", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);

  await act(async () =>
    root.render(
      <Menu.Root defaultOpen>
        <Menu.Trigger>Block actions</Menu.Trigger>
        <Menu.Content aria-label="Block actions">
          <Action icon={<Copy />} shortcut="⌘D">
            Duplicate
          </Action>
          <Action icon={<Trash />}>Remove hint</Action>
        </Menu.Content>
      </Menu.Root>,
    ),
  );

  const rows = [...document.querySelectorAll('[role="menuitem"]')];

  expect(rows.map((row) => row.querySelector("kbd")?.textContent ?? null)).toEqual(["⌘D", null]);
  await act(async () => root.unmount());
});
