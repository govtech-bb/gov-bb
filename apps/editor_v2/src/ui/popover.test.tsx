/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Popover } from "./popover";

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

const render = (node: ReactNode) => act(async () => root.render(node));

// The popover renders in a portal outside the root
const popup = () => document.querySelector('[role="dialog"]')!;

const text = (id: string | null) => (id ? document.getElementById(id)?.textContent : undefined);

test("is named by its title and described by its description", async () => {
  await render(
    <Popover.Root defaultOpen>
      <Popover.Trigger>Visibility</Popover.Trigger>
      <Popover.Content aria-labelledby="visibility-title">
        <Popover.Title id="visibility-title">Public</Popover.Title>
        <Popover.Description>Anyone can find this page.</Popover.Description>
      </Popover.Content>
    </Popover.Root>,
  );

  expect(text(popup().getAttribute("aria-labelledby"))).toBe("Public");
  expect(text(popup().getAttribute("aria-describedby"))).toBe("Anyone can find this page.");
});

test("takes a name when it has no title", async () => {
  await render(
    <Popover.Root defaultOpen>
      <Popover.Trigger>Top</Popover.Trigger>
      <Popover.Content side="top" aria-label="Top popover">
        Above the button.
      </Popover.Content>
    </Popover.Root>,
  );

  expect(popup().getAttribute("aria-label")).toBe("Top popover");
});

test("is named by any element it says it's labelled by", async () => {
  await render(
    <>
      <h3 id="start-button">Start button</h3>
      <Popover.Root defaultOpen>
        <Popover.Trigger>Edit</Popover.Trigger>
        <Popover.Content aria-labelledby="start-button">Button text</Popover.Content>
      </Popover.Root>
    </>,
  );

  expect(text(popup().getAttribute("aria-labelledby"))).toBe("Start button");
});
