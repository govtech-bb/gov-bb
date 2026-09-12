import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  SquaresFourIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { AppLink } from "../app-link";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Empty } from "../ui/empty";
import { Tabs } from "../ui/tabs";
import { cn } from "../ui/utils/cn";
import {
  serviceCategory,
  serviceStatus,
  type ServiceRow,
} from "./service-model";

interface ServiceLibraryProps {
  services: ServiceRow[];
  formsAvailable: boolean;
  loading: boolean;
  query: string;
  view: "grid" | "list";
  reviewKeys: Set<string>;
  onQueryChange: (query: string) => void;
  onViewChange: (view: "grid" | "list") => void;
  unavailable: boolean;
  onRetry: () => void;
}

export function ServiceLibrary({
  services,
  formsAvailable,
  loading,
  query,
  view,
  reviewKeys,
  onQueryChange,
  onViewChange,
  unavailable,
  onRetry,
}: ServiceLibraryProps) {
  const [filter, setFilter] = useState("all");
  const filtered = services.filter(
    (service) =>
      service.searchText.includes(query.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "review"
          ? reviewKeys.has(service.key)
          : serviceStatus(service).toLowerCase() === filter)),
  );
  const hasFilters = !!query.trim() || filter !== "all";
  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ui-strong">
            Service library
          </h1>
          <p className="mt-2 text-base text-ui-subtle">
            Everything for a service, from the first page to the application
            form.
          </p>
        </div>
        <AppLink
          variant="primary"
          icon={<PlusIcon aria-hidden="true" />}
          to="/services/new"
        >
          Create a service
        </AppLink>
      </header>
      <Tabs
        aria-label="Filter services"
        variant="underline"
        value={filter}
        onValueChange={setFilter}
        className="mb-5"
        listClassName="gap-1 @min-[36rem]:gap-4 [&_[role=tab]]:shrink-0"
        tabs={[
          { value: "all", label: `All (${services.length})` },
          { value: "draft", label: "Drafts" },
          { value: "review", label: "In review" },
          { value: "published", label: "Published" },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 @min-[40rem]:max-w-96">
          <MagnifyingGlassIcon
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 z-1 -translate-y-1/2 text-ui-subtle"
          />
          <Input
            type="search"
            aria-label="Search services"
            placeholder="Search services…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="w-full ps-10"
          />
        </div>
        <Button
          variant="ghost"
          shape="square"
          aria-label="Refresh services"
          onClick={onRetry}
          disabled={loading}
          icon={<ArrowsClockwiseIcon aria-hidden="true" />}
        />
        <div
          role="group"
          aria-label="Service view"
          className="ms-auto flex items-center gap-0.5 rounded-lg bg-ui-recessed p-0.5"
        >
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
            className={cn(view === "list" && "bg-ui-base text-ui-default")}
            icon={<ListBulletsIcon aria-hidden="true" />}
          />
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
            className={cn(view === "grid" && "bg-ui-base text-ui-default")}
            icon={<SquaresFourIcon aria-hidden="true" />}
          />
        </div>
      </div>
      <p role="status" className="mb-3 text-xs text-ui-subtle">
        {loading
          ? "Loading services…"
          : unavailable
            ? "Services could not be loaded"
            : `${filtered.length} ${filtered.length === 1 ? "service" : "services"}${hasFilters ? " found" : ""}`}
      </p>
      {loading ? (
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-lg border border-ui-hairline bg-ui-base"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-20 border-b border-ui-hairline last:border-0 motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : unavailable ? (
        <Empty
          title="Services are unavailable"
          description="Refresh to try loading your services again."
          contents={<Button onClick={onRetry}>Try again</Button>}
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<StackIcon size={28} aria-hidden="true" />}
          title={hasFilters ? "No services found" : "Create your first service"}
          description={
            hasFilters
              ? "Try a different name or clear the filters."
              : "Start with a service page. Add guidance and an application form as you need them."
          }
          contents={
            hasFilters ? (
              <Button
                onClick={() => {
                  onQueryChange("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <AppLink to="/services/new">Create a service</AppLink>
            )
          }
        />
      ) : (
        <div
          className={cn(
            view === "list" &&
              "overflow-hidden rounded-lg border border-ui-hairline bg-ui-base",
          )}
        >
          {view === "list" && (
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_9rem_13rem_1rem] gap-6 border-b border-ui-hairline bg-ui-elevated px-5 py-2.5 text-xs font-medium text-ui-subtle @min-[48rem]:grid"
            >
              <span>Service</span>
              <span>Includes</span>
              <span>Status</span>
              <span />
            </div>
          )}
          <ul
            aria-label="Services"
            className={cn(
              view === "grid"
                ? "grid gap-4 @min-[36rem]:grid-cols-2 @min-[65rem]:grid-cols-3"
                : "divide-y divide-ui-hairline",
            )}
          >
            {filtered.map((service) => {
              const status = serviceStatus(service);
              return (
                <li key={service.key} className="min-w-0">
                  <Link
                    to="/services"
                    search={{ service: service.key }}
                    className={cn(
                      "group flex h-full min-w-0 flex-col gap-4 p-5 text-ui-default no-underline outline-hidden transition-colors hover:bg-ui-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus",
                      view === "grid"
                        ? "rounded-lg border border-ui-hairline bg-ui-base"
                        : "@min-[48rem]:grid @min-[48rem]:grid-cols-[minmax(0,1fr)_9rem_13rem_1rem] @min-[48rem]:items-center @min-[48rem]:gap-6",
                    )}
                  >
                    <div className="min-w-0">
                      <h2 className="text-base font-medium text-ui-strong wrap-anywhere group-hover:text-ui-link">
                        {service.title}
                      </h2>
                      <p className="mt-1 text-xs text-ui-subtle">
                        {serviceCategory(service.category)}
                      </p>
                    </div>
                    <div className="text-sm text-ui-subtle">
                      <span>
                        {service.pages.length}{" "}
                        {service.pages.length === 1 ? "page" : "pages"}
                      </span>
                      <span className="ms-2 @min-[48rem]:ms-0 @min-[48rem]:block">
                        {!formsAvailable
                          ? "Forms unavailable"
                          : service.form && !service.form.isOrphanOverride
                            ? "1 form"
                            : "No form"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          status === "Published"
                            ? "success"
                            : status === "Disabled"
                              ? "error"
                              : "secondary"
                        }
                      >
                        {status}
                      </Badge>
                      {reviewKeys.has(service.key) && (
                        <Badge variant="info">In review</Badge>
                      )}
                      {service.form?.hasDraftRow &&
                        service.form.isPublished && (
                          <span className="text-xs text-ui-subtle">
                            Working copy
                          </span>
                        )}
                    </div>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className={cn(
                        "hidden size-4 text-ui-subtle",
                        view === "list" && "@min-[48rem]:block",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
