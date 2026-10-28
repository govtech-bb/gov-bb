import { X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { categoryLabel } from "../api/categories";
import { ApiFailure, type EditorApi, type ServiceSummary } from "../api/client";
import { categoriesQuery, servicesQuery } from "../api/queries";
import { visibilityLabels, visibilityTones } from "../pages";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ScreenHeader } from "../ui/screen-header";
import { Select, type SelectItem } from "../ui/select";
import { StatusDot } from "../ui/status-dot";
import { NameCell } from "../ui/table/cell-components";
import { TextLink } from "../ui/text-link";
import {
  createAppColumnHelper,
  useAppTable,
  useTableFilters,
  useTableContext,
} from "../ui/table/table-hooks";
import { LoadFailure } from "./load-failure";
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
    <NameCell
      className="@3xl:min-w-72"
      name={
        <TextLink
          render={
            <Link
              to="/services/$serviceId/$documentId"
              params={{ serviceId: service.id, documentId: service.id }}
            />
          }
        >
          {service.title}
        </TextLink>
      }
      path={
        href ? (
          <TextLink external href={href} className="block w-fit text-muted">
            {service.url}
          </TextLink>
        ) : (
          service.url
        )
      }
      details={
        <>
          <VisibilityTag visibility={service.visibility} />
          {service.category.title}
        </>
      }
    />
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
    // Filtered by its slug, which the list's address keeps: a renamed category, or two with one name, stay apart
    column.accessor((service) => service.category.slug, {
      id: "category",
      header: "Category",
      sortFn: (a, b) => a.original.category.title.localeCompare(b.original.category.title),
      filterFn: "oneOf",
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ row }) => <span className="text-14">{row.original.category.title}</span>,
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

// Each with the dot it has beside a page in the service's navigation
const statusItems: SelectItem[] = visibilities.map((visibility) => ({
  value: visibility,
  label: visibilityLabel(visibility),
  icon: <StatusDot tone={visibilityTones.get(visibility) ?? "neutral"} />,
}));

/**
 * The toolbar over the list: search, one category, any of the statuses, and Clear filters while any of them leave
 * services out. One row while there's room; on a phone the search takes a row of its own.
 */
function ServiceFilters({ categories }: { categories: readonly SelectItem[] }) {
  const table = useTableContext();
  const filters = useTableFilters();
  // Clear filters goes once pressed, so focus moves on to the search box
  const searchBox = useRef<HTMLInputElement>(null);

  // SAFETY: Only these filters set the column filters, always as the string arrays oneOf reads.
  const chosen = (column: string) =>
    (table.getColumn(column)?.getFilterValue() as string[] | undefined) ?? [];

  const choose = (column: string, values: string[]) =>
    table.getColumn(column)?.setFilterValue(values.length ? values : undefined);

  // A category from an old or edited link that no service is filed under, such as a title from before filters used
  // slugs: it still matches nothing, but shows as itself, so the author sees why the list is empty and can clear it
  const category = chosen("category")[0] ?? "";

  const unknown =
    category && !categories.some((item) => item.value === category)
      ? [{ value: category, label: `${category} (no services)` }]
      : [];

  return (
    <div
      role="search"
      aria-label="Filter services"
      className="flex flex-wrap items-center gap-2 border-b border-line p-3 @xl:px-4"
    >
      <table.Search
        ref={searchBox}
        label="Search title or URL"
        placeholder="Search title or URL"
        className="grow basis-full @xl:max-w-80 @xl:basis-60"
      />
      <Select
        variant="filter"
        aria-label="Category"
        className="grow basis-36 @xl:grow-0 @xl:basis-auto"
        items={[{ value: "", label: "All categories" }, ...unknown, ...categories]}
        value={category}
        onValueChange={(category) => choose("category", category ? [category] : [])}
      />
      <Select
        variant="filter"
        multiple
        aria-label="Status"
        placeholder="All statuses"
        className="grow basis-36 @xl:grow-0 @xl:basis-auto"
        items={statusItems}
        value={chosen("visibility")}
        onValueChange={(statuses) => choose("visibility", statuses)}
      />
      {filters.filtered && (
        <Button
          icon={<X />}
          onClick={() => {
            filters.clear();
            searchBox.current?.focus();
          }}
        >
          Clear filters
        </Button>
      )}
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
  readOnly = false,
}: {
  api: EditorApi;
  search: ServicesSearch;
  onSearch: (search: ServicesSearch) => void;
  onCreate: () => void;
  /** Services can't be created, for someone who can't make changes; the workspace says why. */
  readOnly?: boolean;
}) {
  const services = useQuery(servicesQuery(api));
  const categoryList = useQuery(categoriesQuery(api));
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

  const categories = useMemo(() => {
    const saved = categoryList.data;

    if (saved)
      return saved
        .map((category) => ({ value: category.slug, label: categoryLabel(category, saved) }))
        .toSorted((a, b) => a.label.localeCompare(b.label));

    // Until categories can be read, the services still provide usable filter labels.
    const titles = new Map(
      (services.data ?? []).map((service) => [service.category.slug, service.category.title]),
    );

    const shared = (slug: string, title: string) =>
      [...titles].some(([other, name]) => other !== slug && name === title);

    return [...titles]
      .map(([slug, title]) => ({
        value: slug,
        label: shared(slug, title) ? `${title} (${slug})` : title,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [categoryList.data, services.data]);

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
      <ScreenHeader
        title="Services"
        action={
          <Button variant="accent" size="md" disabled={readOnly} onClick={onCreate}>
            Create service
          </Button>
        }
      />
      <div className="@container min-w-0 rounded-sm bg-white shadow-sheet ring-1 ring-grey-40">
        <ServiceFilters categories={categories} />
        <p role="status" className="sr-only">
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
          <LoadFailure
            noun="services"
            error={services.error}
            retrying={services.isFetching}
            retry={() => void services.refetch()}
          />
        ) : (
          <table.DataTable
            caption="Services"
            loading={services.isPending}
            empty={{
              title: "No services yet",
              description: "Create a service to start adding its pages.",
              actions: (
                <Button variant="secondary" disabled={readOnly} onClick={onCreate}>
                  Create service
                </Button>
              ),
            }}
          />
        )}
        {!blocked && <table.Pagination name={["service", "services"]} />}
      </div>
    </table.AppTable>
  );
}
