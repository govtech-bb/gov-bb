import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Kbd } from "./kbd";

test("shows keys already written for the platform as one keycap", () => {
  const html = renderToStaticMarkup(
    <p>
      <Kbd>⌘⇧H</Kbd> or <Kbd>Ctrl+Shift+H</Kbd>
    </p>,
  );

  expect([...html.matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map(([, keys]) => keys)).toEqual([
    "⌘⇧H",
    "Ctrl+Shift+H",
  ]);
});
