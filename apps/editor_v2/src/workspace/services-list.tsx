import { ArrowSquareOut } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { servicesQuery, type EditorApi, type ServiceSummary } from "../api/services";
import { visibilityLabels } from "../pages";
import { Button } from "../ui/button";
import { createAppColumnHelper, useAppTable } from "../ui/table/hook";

const column = createAppColumnHelper<ServiceSummary>();

// A stable empty list: a new [] each render would reset the table's page every render.
const loading: ServiceSummary[] = [];

const serviceColumns = (api: EditorApi) =>
  column.columns([
    // The url rides along so search finds it; sorting still follows the title.
    column.accessor((service) => `${service.title} ${service.url}`, {
      id: "title",
      header: "Service",
      sortFn: "text",
      enableHiding: false,
      cell: ({ row: { original: service } }) => {
        const href = api.landingUrl(service.url);

        return (
          <div className="min-w-60">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-interactive underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
              >
                {service.title}
                <ArrowSquareOut aria-hidden="true" className="ms-1 inline size-3.5" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="font-semibold">{service.title}</span>
            )}
            <span className="mt-0.5 block text-12 text-muted">{service.url}</span>
          </div>
        );
      },
    }),
    column.accessor((service) => service.category.title, {
      id: "category",
      header: "Category",
      sortFn: "text",
      cell: ({ cell }) => <cell.TextCell />,
    }),
    column.accessor((service) => visibilityLabels.get(service.visibility) ?? service.visibility, {
      id: "visibility",
      header: "Visibility",
      sortFn: "text",
      cell: ({ getValue }) => (
        <span className="rounded-sm bg-tint px-1.5 py-0.5 text-13 whitespace-nowrap">
          {getValue()}
        </span>
      ),
    }),
    column.accessor("form_id", {
      header: "Form",
      sortFn: "text",
      cell: ({ cell }) => <cell.TextCell />,
    }),
    column.accessor("page_count", {
      header: "Pages",
      sortFn: "basic",
      enableGlobalFilter: false,
      cell: ({ row: { original: service } }) => (
        <>
          {service.page_count}
          {service.has_start_page && (
            <span className="block text-12 text-muted">Has start page</span>
          )}
        </>
      ),
    }),
    column.accessor("updated_at", {
      header: "Updated",
      sortFn: "basic",
      sortDescFirst: true,
      enableGlobalFilter: false,
      cell: ({ cell }) => <cell.DateCell />,
    }),
  ]);

/** The api_v2 estate as a read-only list; opening a service in the editor is still to come. */
export function ServicesList({ api }: { api: EditorApi }) {
  const services = useQuery(servicesQuery(api));
  const columns = useMemo(() => serviceColumns(api), [api]);

  const table = useAppTable({
    columns,
    data: services.data ?? loading,
    getRowId: (service) => service.id,
    initialState: {
      sorting: [{ id: "title", desc: false }],
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  if (services.isPending)
    return (
      <p role="status" className="py-10 text-muted">
        Loading services…
      </p>
    );

  if (services.isError)
    return (
      <div role="alert" className="border-s-4 border-error bg-white px-6 py-4">
        <p className="text-error">
          We could not load services. Check you are still signed in, then try again.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => void services.refetch()}>
          Try again
        </Button>
      </div>
    );

  return (
    <table.AppTable>
      <table.Toolbar searchLabel="Search services" name={["service", "services"]} />
      <table.DataTable caption="Services" empty="There are no services yet." />
      <table.Pagination />
    </table.AppTable>
  );
}
