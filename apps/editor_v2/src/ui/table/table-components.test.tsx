/** @vitest-environment jsdom */
import { act, type MouseEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NameCell } from "./cell-components";
import { createAppColumnHelper, useAppTable } from "./table-hooks";

type Service = { id: string; title: string; status: string };

const opened = vi.fn();

// The way into a row, as a list's title link is: here it only says it was followed
const follow = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  opened(event.currentTarget.textContent);
};

const column = createAppColumnHelper<Service>();

const columns = column.columns([
  column.accessor("title", {
    header: "Service",
    cell: ({ row }) => (
      <NameCell
        name={
          <a href={`/services/${row.original.id}`} onClick={follow}>
            {row.original.title}
          </a>
        }
        path={`/family/${row.original.id}`}
      />
    ),
  }),
  column.accessor("status", {
    header: "Status",
    meta: { secondary: true, width: "w-44", align: "end" },
    cell: ({ row }) => (
      <>
        <span>{row.original.status}</span>
        <button type="button">Change {row.original.title}</button>
      </>
    ),
  }),
]);

const services: Service[] = [
  { id: "fees", title: "Pay a fee", status: "Public" },
  { id: "permit", title: "Get a permit", status: "Draft link only" },
];

function List({
  loading = false,
  rowLink,
  data = services,
}: {
  loading?: boolean;
  rowLink?: boolean;
  data?: Service[];
}) {
  const table = useAppTable({ columns, data, getRowId: (row) => row.id });

  return (
    <table.AppTable>
      <table.Search label="Search services" placeholder="Search" />
      <table.DataTable
        caption="Services"
        loading={loading}
        rowLink={rowLink}
        empty={{ title: "No services yet" }}
      />
    </table.AppTable>
  );
}

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  opened.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const show = (list: ReturnType<typeof List>) => act(async () => root.render(list));

const rows = () => [...host.querySelectorAll("tbody tr")];

const click = (target: Element, modifiers: MouseEventInit = {}) =>
  act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }),
    );
  });

test("its columns keep the widths the screen gives them, the leading one taking the rest", async () => {
  await show(<List />);

  const [service, status] = [...host.querySelectorAll("thead th")];

  // Fixed, so loading, sorting, filtering and paging never move a column
  expect(host.querySelector("table")!.classList).toContain("table-fixed");
  expect(status!.classList).toContain("w-44");
  expect([...service!.classList].some((name) => name.startsWith("w-"))).toBe(false);
});

test("loading, its placeholder rows have a loaded row's shape, a name and its address leading each", async () => {
  await show(<List loading />);

  const placeholders = rows();
  const leading = placeholders[1]!.querySelector("td")!;

  // The first says what's loading; none is read out, as the screen's status line says it
  expect(placeholders).toHaveLength(6);
  expect(placeholders.every((row) => row.getAttribute("aria-hidden") === "true")).toBe(true);
  expect(placeholders[0]!.textContent).toBe("Loading services…");

  await show(<List />);

  const loaded = rows()[0]!.querySelector("td")!;

  // The same cell padding round the same two lines: the name's, then the address's
  expect(leading.className).toBe(loaded.className);
  expect(leading.querySelector(".text-14.font-semibold + .font-mono.text-12")).not.toBeNull();
  expect(loaded.querySelector(".text-14.font-semibold + .font-mono.text-12")).not.toBeNull();
});

test("with a row link, a click anywhere on a row but its controls follows its first link", async () => {
  await show(<List rowLink />);

  const [fees] = rows();

  expect(fees!.classList).toContain("cursor-pointer");

  // Its address, its status, and the space beside them
  for (const target of [
    fees!.querySelector(".font-mono")!,
    fees!.querySelector("td:last-child span")!,
    fees!.querySelector("td:last-child")!,
  ])
    await click(target);

  expect(opened.mock.calls).toEqual([["Pay a fee"], ["Pay a fee"], ["Pay a fee"]]);

  // Not from its own controls, which act for themselves, nor a click meant for a new tab
  opened.mockClear();
  await click(fees!.querySelector("button")!);
  await click(fees!.querySelector(".font-mono")!, { metaKey: true });
  expect(opened).not.toHaveBeenCalled();
  await click(fees!.querySelector("a")!);
  expect(opened).toHaveBeenCalledOnce();
});

test("without one, rows still light up for scanning but don't open", async () => {
  await show(<List />);

  const [fees] = rows();

  expect(fees!.classList).toContain("hover:bg-tint");
  expect(fees!.classList).not.toContain("cursor-pointer");
  await click(fees!.querySelector(".font-mono")!);
  expect(opened).not.toHaveBeenCalled();
});

test("a column sorts from its header, which says which way for screen readers", async () => {
  await show(<List />);

  const header = (name: string) =>
    [...host.querySelectorAll("thead th")].find((cell) => cell.textContent === name)!;

  const titles = () => rows().map((row) => row.querySelector("a")?.textContent);

  // Each can sort, and none has yet
  expect(header("Service").getAttribute("aria-sort")).toBe("none");
  expect(header("Status").getAttribute("aria-sort")).toBe("none");
  expect(titles()).toEqual(["Pay a fee", "Get a permit"]);

  await click(header("Service").querySelector("button")!);
  expect(header("Service").getAttribute("aria-sort")).toBe("ascending");
  expect(titles()).toEqual(["Get a permit", "Pay a fee"]);

  await click(header("Service").querySelector("button")!);
  expect(header("Service").getAttribute("aria-sort")).toBe("descending");
  expect(titles()).toEqual(["Pay a fee", "Get a permit"]);
  // Only the sorted column says so
  expect(header("Status").getAttribute("aria-sort")).toBe("none");
});

test("a search that leaves every row out says so, where an empty list offers its first step", async () => {
  await show(<List />);

  const search = host.querySelector<HTMLInputElement>('input[aria-label="Search services"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      search,
      "passport",
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.textContent).toBe("Nothing matches these filters");

  await show(<List data={[]} />);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(rows()[0]!.textContent).toBe("No services yet");
});

test("a column aligned to its end lines up its header and its cells there", async () => {
  await show(<List />);

  const [service, status] = [...host.querySelectorAll("thead th")];
  const [title, state] = [...rows()[0]!.querySelectorAll("td")];

  expect(status!.classList).toContain("text-end");
  expect(state!.classList).toContain("text-end");
  expect(service!.classList).not.toContain("text-end");
  expect(title!.classList).not.toContain("text-end");
});
