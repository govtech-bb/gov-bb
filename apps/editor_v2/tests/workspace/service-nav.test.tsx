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
import { browserDraftStorage } from "../../src/host/govbb-draft";
import { newForm, openDocument } from "../../src/workspace/documents";
import { documentKeys, type PageDocument, type WorkspaceDocument } from "../../src/workspace/model";
import { serverPageBaselineKey } from "../../src/workspace/page-sync";
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

const top = (document: WorkspaceDocument): ServiceNavRow => ({ document, depth: 0 });

const page = (title: string) => `---\ntitle: ${title}\n---\n\nAbout the fees.\n`;

const rows = () =>
  [...host.querySelectorAll('nav[aria-label="Service documents"] li')].map(
    (item) => item.textContent,
  );

const retitle = (document: PageDocument, title: string) => {
  const store = openDocument(document, browserDraftStorage);

  return {
    store,
    apply: () =>
      act(async () => {
        store.edit(page(title));
        store.apply();
      }),
  };
};

test("a page retitled in a browser draft's editor is renamed in the sidebar", async () => {
  const fees: PageDocument = {
    id: "fees",
    title: "Fees",
    kind: "page",
    role: "supporting",
    keys: documentKeys("fees"),
  };

  localStorage.setItem(fees.keys.committed, page("Fees"));
  const open = retitle(fees, "Fees and charges");
  await render({ rows: [top(fees)], stores: new Map([[fees.id, open.store]]) });

  expect(rows()).toEqual(["Fees"]);
  await open.apply();
  expect(rows()).toEqual(["Fees and charges"]);
});

test("a page from the content API is renamed too, while its editor holds the new title", async () => {
  const fees = pageDocumentFromApi({ id: "fees", title: "Fees", role: "supporting" });
  const open = retitle(fees, "Fees and charges");
  await render({ rows: [top(fees)], stores: new Map([[fees.id, open.store]]) });

  expect(rows()).toEqual(["Fees"]);
  await open.apply();
  expect(rows()).toEqual(["Fees and charges"]);
});

test("a closed page from the content API shows its unsaved title, else the server's latest", async () => {
  const saved = pageDocumentFromApi({
    id: "saved",
    title: "Renamed elsewhere",
    role: "supporting",
  });

  const unsaved = pageDocumentFromApi({ id: "unsaved", title: "Contact", role: "supporting" });

  // This browser last had "Fees" from the server and nothing of its own since; someone has since renamed it
  localStorage.setItem(saved.keys.committed, page("Fees"));
  localStorage.setItem(
    serverPageBaselineKey(saved.id),
    JSON.stringify({ page: { id: saved.id }, markdown: page("Fees") }),
  );
  // Here the author retitled the page and hasn't saved it yet
  localStorage.setItem(unsaved.keys.committed, page("Contact the office"));
  localStorage.setItem(
    serverPageBaselineKey(unsaved.id),
    JSON.stringify({ page: { id: unsaved.id }, markdown: page("Contact") }),
  );

  await render({ rows: [top(saved), top(unsaved)] });

  expect(rows()).toEqual(["Renamed elsewhere", "Contact the office"]);
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
  ).toEqual(["Public", "Preview link only", "Draft link only", "Draft link only"]);
});

test("the service's browser form follows a rule, and Delete page stays off while it's open", async () => {
  const entry = pageDocumentFromApi({ id: "entry", title: "Apply for a licence", role: "entry" });
  const form = newForm("Licence application", "application").document;

  await render({
    rows: [{ ...top(entry), visibility: "public" }, top(form)],
    selectedId: form.id,
    onDelete: () => {},
  });

  const [, forms] = host.querySelectorAll("nav > div > div > ul");

  expect(host.querySelector("hr")).not.toBeNull();
  expect(forms?.textContent).toBe("Application form");
  expect(forms?.querySelector("a")?.getAttribute("aria-current")).toBe("page");
  expect(
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Delete page")
      ?.disabled,
  ).toBe(true);
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
