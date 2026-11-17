/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Badge } from "./badge";
import { Banner } from "./banner";

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

test("an error is an alert, and any other tone a status, unless the caller says otherwise", async () => {
  await render(
    <>
      <Banner tone="error">We could not save this page.</Banner>
      <Banner tone="warning">Page editing is paused.</Banner>
      <Banner tone="warning" role="alert">
        A newer version of this page has been saved.
      </Banner>
    </>,
  );

  expect([...host.children].map((banner) => banner.getAttribute("role"))).toEqual([
    "alert",
    "status",
    "alert",
  ]);
});

test("a strip puts its buttons beside the message, a box puts them under it", async () => {
  await render(
    <>
      <Banner tone="error" layout="strip" actions={<button type="button">Try again</button>}>
        We could not save this page.
      </Banner>
      <Banner
        tone="error"
        title="There is a problem"
        actions={<button type="button">Retry</button>}
      >
        <ul>
          <li>Title: Enter a title</li>
        </ul>
      </Banner>
    </>,
  );

  const [strip, box] = [...host.children];

  // The strip's buttons are a sibling of the message; the box's sit inside it, after the body
  expect(strip!.lastElementChild!.textContent).toBe("Try again");
  expect(box!.children).toHaveLength(1);
  expect(box!.textContent).toBe("There is a problemTitle: Enter a titleRetry");
});

test("a badge's words are its whole label", async () => {
  await render(<Badge tone="success">Public</Badge>);

  expect(host.textContent).toBe("Public");
  expect(host.firstElementChild!.className).toContain("bg-green-10");
});

test("a strip lines up with the bars over it, or inside a card with the card's rows", async () => {
  await render(
    <>
      <Banner tone="warning" layout="strip">
        We could not refresh this service.
      </Banner>
      <Banner tone="warning" layout="strip" inset="card">
        We could not refresh services.
      </Banner>
      <Banner tone="info" inset="card">
        A box keeps its own inset.
      </Banner>
    </>,
  );

  const [bar, card, box] = [...host.children];

  expect(bar!.className).toContain("sm:px-6");
  expect(card!.className).toContain("px-4");
  expect(card!.className).not.toContain("sm:px-6");
  expect(box!.className).toContain("px-3.5");
});
