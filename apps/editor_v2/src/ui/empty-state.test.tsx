/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { EmptyState } from "./empty-state";

const state = (node: ReactNode) =>
  new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html").body.firstElementChild!;

const icon = (element: Element) => element.querySelector('[aria-hidden="true"]')!;

test("a failure is an alert with a red warning, so it can't pass for an empty list", () => {
  const failed = state(<EmptyState kind="failed" title="We could not load services" />);
  const empty = state(<EmptyState title="No services yet" />);

  expect(failed.getAttribute("role")).toBe("alert");
  expect(icon(failed).className).toContain("text-error");
  expect(empty.hasAttribute("role")).toBe(false);
  expect(icon(empty).className).toContain("text-muted");
  expect(icon(failed).innerHTML).not.toBe(icon(empty).innerHTML);
});

test("at page size its title is the screen's heading; smaller, it is not a heading", () => {
  const page = state(<EmptyState kind="not-found" size="page" title="Document not found" />);
  const section = state(<EmptyState title="No services yet" />);

  expect(page.querySelector("h1")?.textContent).toBe("Document not found");
  expect(section.querySelector("h1, h2, h3")).toBeNull();
});

test("reads title, description and actions in order, with a given icon in place of the kind's", () => {
  const custom = state(
    <EmptyState
      icon={<svg data-testid="files" />}
      title="Fees"
      description="Choose a document or add one to this service."
      actions={<button type="button">Add document</button>}
    />,
  );

  expect(custom.textContent).toBe("FeesChoose a document or add one to this service.Add document");
  expect(icon(custom).querySelector('[data-testid="files"]')).not.toBeNull();
});
