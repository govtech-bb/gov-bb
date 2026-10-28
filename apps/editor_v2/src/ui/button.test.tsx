/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "./button";

const classes = (html: string) => /class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test("a ghost button is on while pressed, or while it's the current page, and not otherwise", () => {
  const on = ["bg-blue-10", "text-blue-80"];

  expect(classes(renderToStaticMarkup(<Button aria-pressed>Bold</Button>))).toEqual(
    expect.arrayContaining(on),
  );
  expect(classes(renderToStaticMarkup(<Button aria-current="page">2</Button>))).toEqual(
    expect.arrayContaining(on),
  );
  expect(classes(renderToStaticMarkup(<Button aria-pressed={false}>Bold</Button>))).not.toContain(
    "bg-blue-10",
  );
});

test("the link variant reads as GovBB's link in the size of its text", () => {
  const html = renderToStaticMarkup(<Button variant="link">Line 3: Close the details</Button>);

  expect(html.startsWith('<button type="button"')).toBe(true);
  expect(classes(html)).toEqual(
    expect.arrayContaining(["text-interactive", "underline", "h-auto", "px-0", "font-normal"]),
  );
  expect(classes(html)).not.toContain("h-8");
});

test("is at least 44px each way under a coarse pointer, except as a link in a line of text", () => {
  for (const html of [
    renderToStaticMarkup(<Button size="xs" aria-label="Remove" />),
    renderToStaticMarkup(<Button variant="accent">Publish changes</Button>),
  ])
    expect(classes(html)).toEqual(
      expect.arrayContaining(["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"]),
    );

  expect(classes(renderToStaticMarkup(<Button variant="link">Line 3</Button>))).not.toContain(
    "pointer-coarse:min-h-11",
  );
});

test("held down it presses in, a filled button a step darker, as it looks under the pointer", () => {
  expect(classes(renderToStaticMarkup(<Button variant="accent">Publish changes</Button>))).toEqual(
    expect.arrayContaining([
      "pressable:hover:bg-interactive-active",
      "pressable:active:bg-interactive-active",
      "pressable:active:shadow-press",
    ]),
  );
  expect(classes(renderToStaticMarkup(<Button>Download</Button>))).toEqual(
    expect.arrayContaining(["pressable:active:bg-hover", "pressable:active:shadow-press"]),
  );
});

test("a trigger shows that what it opened is open: tinted, as under the pointer", () => {
  expect(classes(renderToStaticMarkup(<Button aria-expanded>Pages</Button>))).toEqual(
    expect.arrayContaining([
      "aria-expanded:bg-hover",
      "aria-expanded:text-ink",
      "data-popup-open:bg-hover",
    ]),
  );
  expect(
    classes(
      renderToStaticMarkup(
        <Button variant="inverse" aria-expanded>
          Menu
        </Button>,
      ),
    ),
  ).toEqual(expect.arrayContaining(["aria-expanded:bg-white/15", "data-popup-open:bg-white/15"]));
});

test("pending, it keeps its colour and its focus, turns a circle and says it's unavailable", () => {
  const html = renderToStaticMarkup(
    <Button variant="danger" pending>
      Deleting page…
    </Button>,
  );

  expect(html).toContain('aria-disabled="true"');
  expect(html).toMatch(/\sdata-pending=/);
  expect(html).not.toMatch(/\sdisabled=/);
  expect(html).toContain("motion-safe:animate-spin");
  expect(classes(html)).toEqual(expect.arrayContaining(["bg-error", "cursor-progress"]));
});

test("aria-disabled, it keeps its focus but looks disabled, and the pointer doesn't change it", () => {
  const html = renderToStaticMarkup(
    <Button variant="accent" aria-disabled>
      Save
    </Button>,
  );

  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toMatch(/\sdisabled=/);
  expect(html).not.toMatch(/\sdata-pending=/);
  // Faded with a refusing cursor, as disabled, unless it's pending, which keeps its colour
  expect(classes(html)).toEqual(
    expect.arrayContaining([
      "disabled:opacity-50",
      "aria-disabled:not-data-pending:opacity-50",
      "aria-disabled:not-data-pending:cursor-not-allowed",
    ]),
  );
  // Hover and press only change a button a press would act on
  expect(classes(html).filter((name) => /(^|:)(hover|active):/.test(name))).toEqual(
    classes(html).filter((name) => name.startsWith("pressable:")),
  );
});

test("a press does nothing while it's pending or aria-disabled, a form's submit included", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const press = vi.fn();
  const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
  const host = document.body.appendChild(document.createElement("form"));
  const root = createRoot(host);

  host.addEventListener("submit", submit);

  for (const unusable of [{ pending: true }, { "aria-disabled": true }]) {
    await act(async () =>
      root.render(
        <Button type="submit" {...unusable} onClick={press}>
          Save
        </Button>,
      ),
    );

    const button = host.querySelector("button")!;

    await act(async () => button.focus());
    await act(async () => button.click());
    expect(press).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  }

  await act(async () =>
    root.render(
      <Button type="submit" onClick={press}>
        Save
      </Button>,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(press).toHaveBeenCalledOnce();
  expect(submit).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

test("with a pending label, both labels share one cell, so it keeps the wider's width as it starts and stops", () => {
  // The label in use, and the one in reserve, hidden from sight and from screen readers
  const labels = (html: string) => {
    const button = new DOMParser().parseFromString(html, "text/html").querySelector("button")!;
    const cell = button.querySelector(".grid")!;

    return [...cell.children].map((label) => ({
      text: label.textContent,
      place: label.classList.contains("col-start-1") && label.classList.contains("row-start-1"),
      hidden: label.classList.contains("invisible") && label.getAttribute("aria-hidden") === "true",
    }));
  };

  expect(
    labels(renderToStaticMarkup(<Button pendingLabel="Signing out…">Sign out</Button>)),
  ).toEqual([
    { text: "Sign out", place: true, hidden: false },
    { text: "Signing out…", place: true, hidden: true },
  ]);
  expect(
    labels(
      renderToStaticMarkup(
        <Button pending pendingLabel="Signing out…">
          Sign out
        </Button>,
      ),
    ),
  ).toEqual([
    { text: "Sign out", place: true, hidden: true },
    { text: "Signing out…", place: true, hidden: false },
  ]);
  // Without one, its words are as they were
  expect(renderToStaticMarkup(<Button>Sign out</Button>)).toMatch(
    /><span>Sign out<\/span><\/button>$/,
  );
});
