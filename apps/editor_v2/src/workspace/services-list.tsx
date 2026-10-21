import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { ApiFailure, type EditorApi, type ServiceSummary } from "../api/client";
import { servicesQuery } from "../api/queries";
import { visibilityLabels, visibilityTones } from "../pages";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { TextLink } from "../ui/text-link";
import { createAppColumnHelper, useAppTable, useTableContext } from "../ui/table/table-hooks";
import {
  filteredBy,
  pagedTo,
  searchedFor,
  servicesTableState,
  sortedBy,
  type ServicesSearch,
} from "./services-search";

const column = createAppColumnHelper<ServiceSummary>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: ServiceSummary[] = [];

/** A table state change, which is the new state or makes it from the old one. */
const resolve = <T,>(change: T | ((old: T) => T), old: T) =>
  change instanceof Function ? change(old) : change;

const visibilities = ["public", "preview", "draft"] as const;

const visibilityLabel = (visibility: string) => visibilityLabels.get(visibility) ?? visibility;

// Status tags: the words carry the meaning, the page settings' colours back them up
function VisibilityTag({ visibility }: { visibility: ServiceSummary["visibility"] }) {
  return (
    <Badge tone={visibilityTones.get(visibility) ?? "neutral"}>{visibilityLabel(visibility)}</Badge>
  );
}

function ServiceCell({ service, href }: { service: ServiceSummary; href: string | undefined }) {
  return (
    <div className="min-w-0 py-0.5 @3xl:min-w-72">
      <TextLink
        render={
          <Link
            to="/services/$serviceId/$documentId"
            params={{ serviceId: service.id, documentId: service.id }}
          />
        }
        className="text-14 font-semibold"
      >
        {service.title}
      </TextLink>
      {href ? (
        <TextLink
          external
          href={href}
          className="mt-0.5 block w-fit font-mono text-12 wrap-break-word text-muted"
        >
          {service.url}
        </TextLink>
      ) : (
        <span className="mt-0.5 block font-mono text-12 wrap-break-word text-muted">
          {service.url}
        </span>
      )}
      <span className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-12 text-muted @max-3xl:flex">
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
    // Filtered by the status itself, the word the list's address keeps; its label sorts the same way
    column.accessor("visibility", {
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

  // SAFETY: Only these filters set the column filters, always as the string arrays oneOf reads.
  const chosen = (column: string) =>
    (table.getColumn(column)?.getFilterValue() as string[] | undefined) ?? [];

  const choose = (column: string, values: string[]) =>
    table.getColumn(column)?.setFilterValue(values.length ? values : undefined);

  const statuses = chosen("visibility");

  return (
    <div role="search" aria-label="Filter services" className="flex flex-col gap-6 text-14">
      <Field label="Search title or URL">
        <Input
          type="search"
          value={table.state.globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
        />
      </Field>
      <Field label="Category">
        <NativeSelect
          value={chosen("category")[0] ?? ""}
          onChange={(event) => choose("category", event.target.value ? [event.target.value] : [])}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset>
        <legend className="mb-1.5 font-semibold">Status</legend>
        {visibilities.map((visibility) => (
          <Checkbox
            key={visibility}
            label={visibilityLabel(visibility)}
            className="py-1"
            checked={statuses.includes(visibility)}
            onCheckedChange={(checked) =>
              choose(
                "visibility",
                checked
                  ? [...statuses, visibility]
                  : statuses.filter((value) => value !== visibility),
              )
            }
          />
        ))}
      </fieldset>
    </div>
  );
}

/**
 * The api_v2 estate, newest change first; each service opens in the editor at its entry page. It opens at `search`,
 * the place in the list its address keeps, and tells `onSearch` each new place so the address keeps that.
 */
export function ServicesList({
  api,
  search,
  onSearch,
  onCreate,
}: {
  api: EditorApi;
  search: ServicesSearch;
  onSearch: (search: ServicesSearch) => void;
  onCreate: () => void;
}) {
  const services = useQuery(servicesQuery(api));
  const href = useRouterState({ select: (state) => state.location.href });
  const status = services.error instanceof ApiFailure ? services.error.status : undefined;

  const refreshFailed =
    services.isError &&
    !!services.data &&
    (status === 0 || (status !== undefined && status >= 500));

  const blocked = services.isError && !refreshFailed;
  const columns = useMemo(() => serviceColumns(api), [api]);

  // The list answers each change at once, and the address follows
  const [place, setPlace] = useState(search);
  const state = useMemo(() => servicesTableState(place), [place]);
  const remember = useEffectEvent(onSearch);

  useEffect(() => remember(place), [place]);

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
    state,
    // A new search, filter or sort goes back to the first page itself, so a page from the address survives the load
    autoResetPageIndex: false,
    onGlobalFilterChange: (change) =>
      setPlace((old) => searchedFor(old, String(resolve(change, old.q ?? "") ?? ""))),
    onColumnFiltersChange: (change) =>
      setPlace((old) => {
        const filters = resolve(change, servicesTableState(old).columnFilters);

        // SAFETY: Only the filters beside the list set these, always as the string arrays oneOf reads.
        const chosen = (id: string) =>
          filters.find((filter) => filter.id === id)?.value as string[] | undefined;

        return filteredBy(old, { category: chosen("category")?.[0], status: chosen("visibility") });
      }),
    // Without a column chosen, such as after a third click on one, the list is newest change first again
    onSortingChange: (change) =>
      setPlace((old) => {
        const [sorted] = resolve(change, servicesTableState(old).sorting);

        return sortedBy(old, sorted?.id ?? "updated_at", sorted?.desc ?? true);
      }),
    onPaginationChange: (change) =>
      setPlace((old) => {
        const { pageIndex, pageSize } = resolve(change, servicesTableState(old).pagination);

        return pagedTo(old, pageIndex, pageSize);
      }),
  });

  // An address past the last page, such as an old link to a list that has since shrunk, shows the last page
  const pages = table.getPageCount();

  useEffect(() => {
    if (services.data && pages > 0 && state.pagination.pageIndex >= pages)
      setPlace((old) => pagedTo(old, pages - 1, old.size ?? 25));
  }, [services.data, pages, state.pagination.pageIndex]);

  return (
    <table.AppTable>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-28 font-semibold">Services</h1>
        <Button variant="accent" size="md" onClick={onCreate}>
          Create service
        </Button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ServiceFilters categories={categories} />
        <div className="@container min-w-0 rounded-sm bg-white shadow-sheet">
          <p role="status" className="px-4 py-3 text-14 text-muted empty:hidden">
            {services.isPending ? "Loading services…" : null}
          </p>
          {refreshFailed && (
            <Banner
              tone="warning"
              layout="strip"
              actions={
                <Button
                  variant="secondary"
                  pending={services.isFetching}
                  onClick={() => void services.refetch()}
                >
                  {services.isFetching ? "Refreshing services…" : "Try again"}
                </Button>
              }
            >
              We could not refresh services. Showing the last loaded list.
            </Banner>
          )}
          {blocked ? (
            <EmptyState
              kind="failed"
              title="We could not load services"
              description={
                status === 401
                  ? "Your session has ended. Sign in again to load services."
                  : status === 403
                    ? "You do not have access to these services."
                    : "Check your connection, then try again."
              }
              actions={
                status === 401 ? (
                  <TextLink
                    render={
                      <Link
                        to="/auth"
                        search={{ state: "sign-in", returnTo: href, reason: "provider" }}
                      />
                    }
                  >
                    Sign in again
                  </TextLink>
                ) : (
                  <Button variant="secondary" onClick={() => void services.refetch()}>
                    Try again
                  </Button>
                )
              }
            />
          ) : (
            <table.DataTable
              caption="Services"
              loading={services.isPending}
              empty={{
                title: "No services yet",
                description: "Create a service to start adding its pages.",
                actions: (
                  <Button variant="secondary" onClick={onCreate}>
                    Create service
                  </Button>
                ),
              }}
            />
          )}
          {!blocked && <table.Pagination name={["service", "services"]} />}
        </div>
      </div>
    </table.AppTable>
  );
}
