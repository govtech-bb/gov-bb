import { ArrowUpRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo } from "react";
import type { EditorApi, ServiceSummary } from "../api/client";
import { servicesQuery } from "../api/queries";
import { cn } from "../cn";
import { visibilityLabels } from "../pages";
import { Button } from "../ui/button";
import { settingsInput } from "../ui/input";
import { createAppColumnHelper, useAppTable, useTableContext } from "../ui/table/hook";

const column = createAppColumnHelper<ServiceSummary>();

// A stable empty list: a new [] each render would reset the table's page every render.
const loading: ServiceSummary[] = [];

const visibilities = ["public", "preview", "draft"] as const;

const visibilityLabel = (visibility: string) => visibilityLabels.get(visibility) ?? visibility;

// Status tags: live is green, link-only is yellow, draft is grey, and the words carry the meaning.
const tones = {
  public: "bg-green-10 text-green-80",
  preview: "bg-yellow-20 text-ink",
  draft: "bg-grey-20 text-grey-80",
};

function VisibilityTag({ visibility }: { visibility: ServiceSummary["visibility"] }) {
  return (
    <strong
      className={cn(
        "inline-block rounded-sm px-2 py-0.5 text-13 font-semibold whitespace-nowrap",
        tones[visibility],
      )}
    >
      {visibilityLabel(visibility)}
    </strong>
  );
}

function ServiceCell({ service, href }: { service: ServiceSummary; href: string | undefined }) {
  return (
    <div className="min-w-0 py-0.5 @3xl:min-w-72">
      <Link
        to="/services/$serviceId/$documentId"
        params={{ serviceId: service.id, documentId: service.id }}
        className="text-15 leading-snug font-semibold text-interactive underline-offset-4 hover:underline"
      >
        {service.title}
      </Link>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="group/path mt-0.5 block font-mono text-12 wrap-break-word text-muted hover:text-ink hover:underline hover:underline-offset-4"
        >
          {service.url}
          <ArrowUpRight
            aria-hidden="true"
            className="ms-1 inline size-3 text-muted group-hover/path:text-ink"
          />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="mt-0.5 block font-mono text-12 wrap-break-word text-muted">
          {service.url}
        </span>
      )}
      <span className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted @max-3xl:flex">
        <VisibilityTag visibility={service.visibility} />
        {service.category.title}
      </span>
    </div>
  );
}

const serviceColumns = (api: EditorApi) =>
  column.columns([
    // The url rides along so search finds it; sorting still follows the title.
    column.accessor((service) => `${service.title} ${service.url}`, {
      id: "title",
      header: "Service",
      sortFn: "text",
      enableHiding: false,
      cell: ({ row: { original: service } }) => (
        <ServiceCell service={service} href={api.landingUrl(service.url)} />
      ),
    }),
    column.accessor((service) => service.category.title, {
      id: "category",
      header: "Category",
      sortFn: "text",
      filterFn: "oneOf",
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ cell }) => <cell.TextCell />,
    }),
    column.accessor("updated_at", {
      header: "Updated",
      sortFn: "basic",
      sortDescFirst: true,
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ cell }) => <cell.DateCell />,
    }),
    column.accessor((service) => visibilityLabel(service.visibility), {
      id: "visibility",
      header: "Status",
      sortFn: "text",
      filterFn: "oneOf",
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ row }) => <VisibilityTag visibility={row.original.visibility} />,
    }),
  ]);

/** Filters beside the list: search, one category, any of the statuses. */
function ServiceFilters({ categories }: { categories: readonly string[] }) {
  const table = useTableContext();
  const id = useId();

  // SAFETY: Only these filters set the column filters, always as the string arrays oneOf reads.
  const chosen = (column: string) =>
    (table.getColumn(column)?.getFilterValue() as string[] | undefined) ?? [];

  const choose = (column: string, values: string[]) =>
    table.getColumn(column)?.setFilterValue(values.length ? values : undefined);

  const statuses = chosen("visibility");

  return (
    <div role="search" aria-label="Filter services" className="flex flex-col gap-6 text-14">
      <div>
        <label htmlFor={`${id}-search`} className="mb-1.5 block font-semibold">
          Search title or URL
        </label>
        <input
          id={`${id}-search`}
          type="search"
          className={settingsInput}
          value={table.state.globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${id}-category`} className="mb-1.5 block font-semibold">
          Category
        </label>
        <select
          id={`${id}-category`}
          className={cn(settingsInput, "cursor-pointer")}
          value={chosen("category")[0] ?? ""}
          onChange={(event) => choose("category", event.target.value ? [event.target.value] : [])}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="mb-1.5 font-semibold">Status</legend>
        {visibilities.map((visibility) => {
          const label = visibilityLabel(visibility);

          return (
            <label key={visibility} className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                className="size-4 cursor-pointer accent-interactive"
                checked={statuses.includes(label)}
                onChange={(event) =>
                  choose(
                    "visibility",
                    event.target.checked
                      ? [...statuses, label]
                      : statuses.filter((value) => value !== label),
                  )
                }
              />
              {label}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

/** The api_v2 estate, newest change first; each service opens in the editor at its entry page. */
export function ServicesList({ api, onCreate }: { api: EditorApi; onCreate: () => void }) {
  const services = useQuery(servicesQuery(api));
  const columns = useMemo(() => serviceColumns(api), [api]);

  const categories = useMemo(
    () =>
      [...new Set((services.data ?? []).map((service) => service.category.title))].toSorted(
        (a, b) => a.localeCompare(b),
      ),
    [services.data],
  );

  const table = useAppTable({
    columns,
    data: services.data ?? loading,
    getRowId: (service) => service.id,
    initialState: {
      sorting: [{ id: "updated_at", desc: true }],
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  return (
    <table.AppTable>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-32 font-semibold tracking-tight">Services</h1>
        <Button variant="accent" size="lg" onClick={onCreate}>
          Create service
        </Button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ServiceFilters categories={categories} />
        <div className="@container min-w-0 rounded-sm bg-white shadow-sheet">
          {services.isError ? (
            <div role="alert" className="px-4 py-16 text-center">
              <p className="text-16 font-semibold">We could not load services</p>
              <p className="mt-1 text-muted">Check you are still signed in, then try again.</p>
              <Button variant="secondary" className="mt-4" onClick={() => void services.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <table.DataTable
              caption="Services"
              loading={services.isPending}
              empty={{
                title: "No services yet",
                hint: "Services appear here when pages are added to the content API.",
              }}
            />
          )}
          <table.Pagination name={["service", "services"]} />
        </div>
      </div>
    </table.AppTable>
  );
}
