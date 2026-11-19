/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TextLink } from "./text-link";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html").body;

test("a link to another site opens in a new tab and says so", () => {
  const link = parse(
    renderToStaticMarkup(
      <TextLink external href="https://alpha.gov.bb/renew">
        published service
      </TextLink>,
    ),
  ).querySelector("a")!;

  expect(link.getAttribute("href")).toBe("https://alpha.gov.bb/renew");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noreferrer");
  expect(link.textContent).toBe("published service (opens in a new tab)");
  expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("renders the element it's given, such as the router's link, with the link's look", () => {
  const html = renderToStaticMarkup(
    <TextLink render={<a href="/services" data-router="" />} className="font-semibold">
      Back to services
    </TextLink>,
  );

  const link = parse(html).querySelector("a")!;

  expect(link.hasAttribute("data-router")).toBe(true);
  expect(link.getAttribute("href")).toBe("/services");
  expect(link.hasAttribute("target")).toBe(false);
  expect(link.textContent).toBe("Back to services");
  expect(link.className).toContain("text-interactive");
  expect(link.className).toContain("font-semibold");
});
