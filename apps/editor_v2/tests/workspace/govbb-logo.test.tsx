/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GovbbLogo } from "../../src/workspace/govbb-logo";

const logo = (markup: string) =>
  new DOMParser().parseFromString(markup, "text/html").body.firstElementChild!;

test("it's one image named GovBB, the design system's artwork inside it", () => {
  const header = logo(renderToStaticMarkup(<GovbbLogo fit="height" className="h-6 shrink-0" />));

  expect(header.getAttribute("role")).toBe("img");
  expect(header.getAttribute("aria-label")).toBe("GovBB");
  expect(header.querySelector("svg")).not.toBeNull();
});

test("sized by its box: a height in the header, a width on the sign-in screen", () => {
  const header = logo(renderToStaticMarkup(<GovbbLogo fit="height" className="h-6 shrink-0" />));
  const signIn = logo(renderToStaticMarkup(<GovbbLogo fit="width" className="w-full max-w-84" />));

  expect([...header.classList].sort()).toEqual(
    ["h-6", "shrink-0", "[&>svg]:h-full", "[&>svg]:w-auto"].sort(),
  );
  expect([...signIn.classList].sort()).toEqual(
    ["w-full", "max-w-84", "[&>svg]:h-auto", "[&>svg]:w-full"].sort(),
  );
});
