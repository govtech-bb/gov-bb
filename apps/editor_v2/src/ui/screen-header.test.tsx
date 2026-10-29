/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ScreenHeader } from "./screen-header";

const header = (node: ReactNode) =>
  new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html").body.firstElementChild!;

test("its title is the screen's heading, the lead under it, and its action after both", () => {
  const categories = header(
    <ScreenHeader
      title="Categories"
      lead="People browse these to find services on the site."
      action={<button type="button">Add category</button>}
    />,
  );

  expect(categories.querySelector("h1")?.textContent).toBe("Categories");
  expect(categories.textContent).toBe(
    "CategoriesPeople browse these to find services on the site.Add category",
  );
  // The lead in the foundations' 16/24, as an empty screen's line under its title
  expect(categories.querySelector("p")?.className).toContain("text-16");
  // Narrow, the action wraps under the title rather than squeezing it
  expect(categories.className).toContain("flex-wrap");
});

test("without a lead or an action, it's the heading alone", () => {
  const services = header(<ScreenHeader title="Services" />);

  expect(services.textContent).toBe("Services");
  expect(services.querySelector("p")).toBeNull();
});
