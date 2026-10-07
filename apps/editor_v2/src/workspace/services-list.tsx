import {
  ArrowUpRight,
  Baby,
  Briefcase,
  Coins,
  FirstAidKit,
  FolderSimple,
  GraduationCap,
  HandHeart,
  House,
  IdentificationCard,
  PiggyBank,
  ShieldCheck,
  Storefront,
  Student,
  UsersThree,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { EditorApi, ServiceSummary } from "../api/client";
import { servicesQuery } from "../api/queries";
import { cn } from "../cn";
import { visibilityLabels } from "../pages";
import { Button } from "../ui/button";
import { createAppColumnHelper, useAppTable } from "../ui/table/hook";

const column = createAppColumnHelper<ServiceSummary>();

// A stable empty list: a new [] each render would reset the table's page every render.
const loading: ServiceSummary[] = [];

const categoryIcons = new Map([
  ["business-trade", Storefront],
  ["education", GraduationCap],
  ["family-birth-relationships", Baby],
  ["health-and-emergency-services", FirstAidKit],
  ["housing", House],
  ["ministry-of-youth", Student],
  ["money-financial-support", Coins],
  ["pensions-and-gratuities", PiggyBank],
  ["public-safety", ShieldCheck],
  ["social-empowerment", HandHeart],
  ["travel-id-citizenship", IdentificationCard],
  ["work-employment", Briefcase],
  ["youth-and-community", UsersThree],
]);

const visibilities = ["public", "preview", "draft"] as const;

const visibilityLabel = (visibility: string) => visibilityLabels.get(visibility) ?? visibility;

// Live is green, link-only is amber, draft is grey. The label always travels with the colour.
const tones = {
  public: "bg-green-10 text-green-80 *:bg-green-80",
  preview: "bg-yellow-20/50 text-ink *:bg-yellow-80",
  draft: "bg-grey-20 text-grey-80 *:bg-grey-60",
};

function VisibilityTag({ visibility }: { visibility: ServiceSummary["visibility"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-13 font-semibold whitespace-nowrap",
        tones[visibility],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" />
      {visibilityLabel(visibility)}
    </span>
  );
}

function ServiceCell({ service, href }: { service: ServiceSummary; href: string | undefined }) {
  const Icon = categoryIcons.get(service.category.slug) ?? FolderSimple;

  return (
    <div className="flex items-start gap-3 @3xl:min-w-72">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-sm bg-blue-10 text-blue-40"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 py-0.5">
        <Link
          to="/services/$serviceId/$documentId"
          params={{ serviceId: service.id, documentId: service.id }}
          className="text-15 leading-snug font-semibold text-ink hover:underline hover:underline-offset-4"
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
      meta: { secondary: true },
      cell: ({ cell }) => <cell.TextCell />,
    }),
    column.accessor((service) => visibilityLabel(service.visibility), {
      id: "visibility",
      header: "Visibility",
      sortFn: "text",
      filterFn: "oneOf",
      meta: { secondary: true },
      cell: ({ row }) => <VisibilityTag visibility={row.original.visibility} />,
    }),
    column.accessor("form_id", {
      header: "Form",
      sortFn: "text",
      meta: { secondary: true },
      cell: ({ getValue }) =>
        getValue() ? (
          <code className="font-mono text-13 wrap-break-word">{getValue()}</code>
        ) : (
          <span className="text-muted">No form</span>
        ),
    }),
    column.accessor("page_count", {
      header: "Pages",
      sortFn: "basic",
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ row: { original: service } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {service.page_count}
          {service.has_start_page && <span className="text-muted"> · with start</span>}
        </span>
      ),
    }),
    column.accessor("updated_at", {
      header: "Updated",
      sortFn: "basic",
      sortDescFirst: true,
      enableGlobalFilter: false,
      meta: { secondary: true },
      cell: ({ cell }) => <cell.DateCell />,
    }),
  ]);

/** The api_v2 estate; each service opens in the editor at its entry page. */
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

  return (
    <table.AppTable>
      <div className="@container rounded-sm bg-white shadow-sheet">
        <table.FilterTabs
          column="visibility"
          legend="Visibility"
          values={visibilities.map(visibilityLabel)}
        />
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <table.Search label="Search services" placeholder="Title, path or form" />
          <table.FilterMenu column="category" label="Category" />
          <table.ColumnsMenu />
        </div>
        {services.isError ? (
          <div role="alert" className="border-t border-line px-4 py-16 text-center">
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
    </table.AppTable>
  );
}
