import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Button } from "./button";

const classes = (html: string) => /class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];

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

test("pending, it keeps its colour and its focus, turns a circle and says it's unavailable", () => {
  const html = renderToStaticMarkup(
    <Button variant="danger" pending>
      Deleting page…
    </Button>,
  );

  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toMatch(/\sdisabled=/);
  expect(html).toContain("motion-safe:animate-spin");
  expect(classes(html)).toEqual(expect.arrayContaining(["bg-error", "cursor-progress"]));
});
