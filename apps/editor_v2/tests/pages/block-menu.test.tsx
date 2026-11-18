/** @vitest-environment jsdom */
import { act } from "react";
import { expect, test, vi } from "vitest";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const rows = () => [
  ...pageControl(".page-block-menu").querySelectorAll<HTMLElement>(
    '[role="menuitem"], [role="menuitemradio"]',
  ),
];

const press = (key: string) =>
  act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

test("Block options moves with the arrow keys, one row at a time, and ends with Delete in red", async () => {
  await renderPageEditor("Fees\n\nSecond\n");
  await selectPageText("Fees");
  await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());

  const last = rows().at(-1)!;
  expect(last.textContent).toBe("Delete block");
  expect(last.className).toContain("text-error");

  await press("ArrowDown");
  const first = document.activeElement;
  await press("ArrowDown");

  expect(rows()).toContain(first);
  expect(rows()).toContain(document.activeElement);
  expect(document.activeElement).not.toBe(first);
  expect(document.querySelectorAll(".page-block-menu [data-highlighted]")).toHaveLength(1);
});

test.each([
  { y: 45, kind: "the heading above", list: false },
  { y: 55, kind: "the list below", list: true },
])(
  "in the gap between two blocks, the rail goes with $kind, whichever half the pointer is in",
  async ({ y, list: onList }) => {
    await renderPageEditor("## Who can apply\n\n- One\n- Two\n");
    const body = pageControl(".page-editable");

    // The page's metadata sits first in the body, hidden
    const [heading, list] = body.querySelectorAll<HTMLElement>(":scope > :not([hidden])");

    // The heading runs 0–40px and the list 60–120px: the gap between them splits at 50px
    const boxes = new Map([
      [heading, new DOMRect(0, 0, 600, 40)],
      [list, new DOMRect(0, 60, 600, 60)],
    ]);

    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement,
    ) {
      return boxes.get(this) ?? new DOMRect(0, 0, 600, 120);
    });

    await act(async () => {
      body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: y }));
    });
    await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());

    // Only a list's menu changes its type
    expect(rows().some((item) => item.textContent === "Change to numbered list")).toBe(onList);
  },
);

test("a press on the grip that slips into a drag, and is let go where it began, opens Block options", async () => {
  await renderPageEditor("Fees\n\nSecond\n");
  await selectPageText("Fees");
  const grip = pageControl<HTMLButtonElement>('[aria-label="Block options"]');

  // The browser starts a drag once a press moves a few pixels: jsdom has no drag, so the events are built by hand
  const drag = (type: string) =>
    Object.assign(new MouseEvent(type, { bubbles: true, clientX: 40, clientY: 20 }), {
      dataTransfer: { setData() {}, setDragImage() {}, effectAllowed: "", types: [] },
    });

  await act(async () => {
    grip.dispatchEvent(drag("dragstart"));
  });
  await act(async () => {
    grip.dispatchEvent(drag("dragend"));
  });

  expect(grip.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe("Block options");
});
