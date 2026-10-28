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
  [...host.querySelectorAll('nav[aria-label="Service documents"] li')].map(
    (item) => item.textContent,
  );

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

test("Delete page says why it can't run yet, instead of failing after the author confirms", async () => {
  const entry = pageDocumentFromApi({ id: "entry", title: "Apply for a licence", role: "entry" });

  const deleteButton = () =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Delete page")!;

  await render({
    rows: [top(entry)],
    selectedId: "entry",
    onDelete: () => {},
    deleteBlocked: "Delete or move the pages under this page first.",
  });

  expect(deleteButton().disabled).toBe(true);
  expect(
    document.getElementById(deleteButton().getAttribute("aria-describedby")!)?.textContent,
  ).toBe("Delete or move the pages under this page first.");

  await render({ rows: [top(entry)], selectedId: "entry", onDelete: () => {} });

  expect(deleteButton().disabled).toBe(false);
  expect(deleteButton().hasAttribute("aria-describedby")).toBe(false);
});

test("a page sits in the list under its parent, dotted with how far it's published", async () => {
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
    [...host.querySelectorAll("li")].find((li) => li.firstElementChild?.textContent === name)!;

  expect(item("Refunds").parentElement?.closest("li")).toBe(item("Fees"));
  expect(item("Contact").parentElement?.closest("li")).toBeNull();
  expect(
    ["Entry page", "Fees", "Refunds", "Contact"].map((name) =>
      item(name).querySelector('[role="img"]')?.getAttribute("aria-label"),
    ),
  ).toEqual(["Public", "Preview link only", "Draft (hidden)", "Draft (hidden)"]);
});

test("while a service's pages load, its sidebar shows what's known and offers nothing yet", async () => {
  const entry = pageDocumentFromApi({ id: "entry", title: "Severance", role: "entry" });
  await render({ rows: [top(entry)], loading: true, onDelete: () => {} });

  expect(rows()).toEqual(["Entry page"]);
  expect(host.textContent).toContain("Loading pages…");
  expect(host.querySelectorAll("button")).toHaveLength(0);

  await render({ rows: [top(entry)], onDelete: () => {} });
  expect(host.textContent).not.toContain("Loading pages…");
  expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
    "Add document",
    "Delete page",
  ]);
});
