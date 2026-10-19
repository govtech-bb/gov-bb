import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RailButton } from "../../src/editor/react/block-rail";
import { Sidebar } from "../../src/ui/sidebar";

test("a rail button is 44px tall on a touch screen, and as wide as three fit in the form's gutter", () => {
  const html = renderToStaticMarkup(<RailButton aria-label="Insert block below" />);

  expect(html).toContain("pointer-coarse:h-11");
  expect(html).toContain("pointer-coarse:w-8");
});

test("a sidebar row is 44px tall on a touch screen, with its name in the middle", () => {
  const html = renderToStaticMarkup(<Sidebar.Item render={<a href="/fees" />}>Fees</Sidebar.Item>);
  const classes = /class="([^"]*)"/.exec(html)?.[1]?.split(" ");

  expect(classes).toEqual(
    expect.arrayContaining(["flex", "pointer-coarse:items-center", "pointer-coarse:min-h-11"]),
  );
});
