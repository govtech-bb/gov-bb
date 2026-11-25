/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftStore } from "../../src/persistence/draft-store";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import type { PageDocument } from "../../src/workspace/model";
import { pageDocumentFromApi, type ServiceNavRow } from "../../src/workspace/service-pages";
import { ServiceNav } from "../../src/workspace/service-nav";

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/services/$serviceId/$documentId" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/history/$pageId" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/services"] }),
});

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
  localStorage.clear();
  vi.unstubAllGlobals();
});

const render = (props: Partial<ComponentProps<typeof ServiceNav>>) =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <ServiceNav
          sidebar={{ id: "sidebar", wide: true, open: true, setOpen: () => {} }}
          serviceId="service"
          rows={[]}
          selectedId={undefined}
          stores={new Map()}
          onAdd={() => {}}
          {...props}
        />
      </RouterContextProvider>,
    ),
  );

const top = (document: PageDocument): ServiceNavRow => ({ document, depth: 0 });

const page = (title: string) => `---\ntitle: ${title}\n---\n\nAbout the fees.\n`;

const rows = () =>
  [...host.querySelectorAll('nav[aria-label="Service pages"] li')].map((item) => item.textContent);

const retitle = (document: PageDocument, title: string) => {
  const store = new DraftStore(page(document.title), govbbPageCodec);

  return {
    store,
    apply: () =>
      act(async () => {
        store.edit(page(title));
        store.apply();
      }),
  };
};

test("a page from the content API is renamed too, while its editor holds the new title", async () => {
  const fees = pageDocumentFromApi({ id: "fees", title: "Fees", role: "supporting" });
  const open = retitle(fees, "Fees and charges");
  await render({ rows: [top(fees)], stores: new Map([[fees.id, open.store]]) });

  expect(rows()).toEqual(["Fees"]);
  await open.apply();
  expect(rows()).toEqual(["Fees and charges"]);
});

test("closed API pages use server titles even when old browser drafts exist", async () => {
  const saved = pageDocumentFromApi({
    id: "saved",
    title: "Renamed elsewhere",
    role: "supporting",
  });

  const unsaved = pageDocumentFromApi({ id: "unsaved", title: "Contact", role: "supporting" });

  localStorage.setItem("govbb-editor:documents:saved:markdown", page("Fees"));
  localStorage.setItem("govbb-editor:documents:unsaved:markdown", page("Contact the office"));

  await render({ rows: [top(saved), top(unsaved)] });

  expect(rows()).toEqual(["Renamed elsewhere", "Contact"]);
});

test("the list is headed by its service's name, two lines at most, with the whole name on hover", async () => {
  const name =
    "Apply to Environmental Health for an offensive trade licence to do work that may cause fumes, smells or waste";

  await render({ title: name });

  const heading = [...host.querySelectorAll("span")].find((span) => span.textContent === name)!;

  expect(heading.classList).toContain("line-clamp-2");
  expect(heading.getAttribute("title")).toBe(name);
});

test("Add page is the list's last row, and says why it can't run for someone who can't make changes", async () => {
  const entry = pageDocumentFromApi({ id: "entry", title: "Apply for a licence", role: "entry" });

  const add = () =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Add page")!;

  await render({ rows: [top(entry)], readOnly: "You need the editor role to add pages." });

  expect(add().disabled).toBe(true);
  expect(document.getElementById(add().getAttribute("aria-describedby")!)?.textContent).toBe(
    "You need the editor role to add pages.",
  );

  await render({ rows: [top(entry)] });

  expect(add().disabled).toBe(false);
  expect(add().hasAttribute("aria-describedby")).toBe(false);
  // After the pages, not apart from them under the list
  expect(add().previousElementSibling?.tagName).toBe("UL");
});

test("a page sits in the list under its parent, dotted with how far it's published, and in words where it isn't public", async () => {
  const row = (
    id: string,
    title: string,
    depth: number,
    visibility: ServiceNavRow["visibility"],
  ) => ({
    document: pageDocumentFromApi({
      id,
      title,
      role: depth || id !== "entry" ? "supporting" : "entry",
    }),
    depth,
    visibility,
  });

  await render({
    rows: [
      row("entry", "Apply for a licence", 0, "public"),
      row("fees", "Fees", 0, "preview"),
      row("refunds", "Refunds", 1, "draft"),
      row("contact", "Contact", 0, "draft"),
    ],
  });

  const item = (name: string) =>
    [...host.querySelectorAll("li")].find(
      (li) => li.firstElementChild?.querySelector("[data-words]")?.textContent === name,
    )!;

  const link = (name: string) => item(name).firstElementChild!;
  const names = ["Entry page", "Fees", "Refunds", "Contact"];

  expect(item("Refunds").parentElement?.closest("li")).toBe(item("Fees"));
  expect(item("Contact").parentElement?.closest("li")).toBeNull();
  // Public is its dot, named; anything else is said under the title too, so its dot only backs the words up
  expect(names.map((name) => link(name).textContent)).toEqual([
    "Entry page",
    "FeesPreview link only",
    "RefundsDraft (hidden)",
    "ContactDraft (hidden)",
  ]);
  expect(
    names.map((name) => link(name).querySelector('[role="img"]')?.getAttribute("aria-label")),
  ).toEqual(["Public", undefined, undefined, undefined]);
});

test("while a service's pages load, its sidebar says so, shows what's known and offers nothing yet", async () => {
  const entry = pageDocumentFromApi({ id: "entry", title: "Severance", role: "entry" });
  await render({ rows: [top(entry)], loading: true });

  // Actions on the pages, that is: the header's Pages toggle only hides the list
  const actions = () => host.querySelectorAll('button:not([aria-label="Pages"])');

  expect(rows()).toEqual(["Entry page"]);
  expect(host.textContent).toContain("Loading pages…");
  // Read out once, as loading rather than as an empty list
  expect([...host.querySelectorAll('[role="status"]')].map((line) => line.textContent)).toEqual([
    "Loading pages…",
  ]);
  expect(actions()).toHaveLength(0);

  await render({ rows: [top(entry)] });
  expect(host.textContent).not.toContain("Loading pages…");
  expect([...actions()].map((button) => button.textContent)).toEqual(["Add page"]);
});
