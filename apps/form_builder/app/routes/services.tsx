import "../styles/builder.global.css";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { checkSession } from "../server/auth";
import { AppShell } from "../components/app-shell";
import { ServiceLibrary } from "../components/services/service-library";
import { ServiceWorkbench } from "../components/services/service-workbench";
import {
  useServiceIndex,
  mergeServiceRows,
  serviceTabs,
  type ServiceTab,
} from "../components/services/service-state";
import { buildServiceRows } from "../components/services/service-model";
import { useFormsList } from "../components/builder/use-forms-list";
import { useContentList } from "../components/content/use-content-list";
import { Button } from "../components/ui/button";
import { Banner } from "../components/ui/banner";
import { Empty } from "../components/ui/empty";

export const Route = createFileRoute("/services")({
  validateSearch: (
    search,
  ): { service?: string; tab?: ServiceTab; setup?: string } => ({
    tab: serviceTabs.some(([key]) => key === search.tab)
      ? (search.tab as ServiceTab)
      : undefined,
    setup: typeof search.setup === "string" ? search.setup : undefined,
    service: typeof search.service === "string" ? search.service : undefined,
  }),
  beforeLoad: async () => {
    if (import.meta.env.DEV) return { user: { login: "dev" } };
    const user = await checkSession();
    if (!user) throw redirect({ to: "/auth/github" });
    return { user };
  },
  head: () => ({ meta: [{ title: "Services · Form Builder" }] }),
  component: ServicesPage,
});

function ServicesPage() {
  const { service: selectedKey, tab = "overview", setup } = Route.useSearch();
  const shared = useServiceIndex();
  const navigate = useNavigate();
  const forms = useFormsList();
  const content = useContentList(true);
  const { user } = Route.useRouteContext();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const services = useMemo(
    () =>
      mergeServiceRows(
        buildServiceRows(forms.forms ?? [], content.pages ?? []),
        shared.entries,
      ),
    [forms.forms, content.pages, shared.entries],
  );
  const selected = services.find(
    (service) =>
      service.key === selectedKey ||
      `form:${service.formId}` === selectedKey ||
      service.pages.some((page) => `page:${page.path}` === selectedKey),
  );
  const loading =
    (forms.forms === null && !forms.loadError) ||
    (content.pages === null && !content.loadError);
  const reviewKeys = new Set(
    services
      .filter(
        (service) =>
          (service.form && forms.openPRs.has(service.form.formId)) ||
          service.pages.some((page) => content.openPRs.has(page.path)),
      )
      .map((service) => service.key),
  );
  const refresh = () => {
    void shared.refresh();
    forms.refetch();
    content.refetch();
  };

  return (
    <AppShell
      section="services"
      user={user.login}
      title={
        selected ? serviceTabs.find(([key]) => key === tab)?.[1] : undefined
      }
      service={selected}
    >
      <div className="ui-scroll-native h-full overflow-y-auto bg-ui-canvas">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 @min-[48rem]:px-8 @min-[48rem]:py-8">
          {(forms.loadError || content.loadError || shared.error) && (
            <Banner variant="error" role="alert" className="mb-5">
              {shared.error && "Saved service drafts could not be loaded. "}
              {forms.loadError && "Forms could not be loaded. "}
              {content.loadError && "Content pages could not be loaded."}
              {(selectedKey || services.length > 0) && (
                <Button size="sm" variant="ghost" onClick={refresh}>
                  Try again
                </Button>
              )}
            </Banner>
          )}
          {content.reviewError && (
            <Banner variant="alert" className="mb-5">
              {content.reviewError}
            </Banner>
          )}
          {selectedKey ? (
            loading ? (
              <p role="status" className="py-12 text-ui-subtle">
                Loading service…
              </p>
            ) : selected ? (
              <ServiceWorkbench
                key={selected.key}
                service={selected}
                content={content}
                tab={tab}
                setup={setup}
              />
            ) : (
              <Empty
                title={
                  forms.loadError || content.loadError
                    ? "Service could not be loaded"
                    : "Service not found"
                }
                description="Return to the service library or refresh to try again."
                contents={
                  <Button
                    onClick={() => navigate({ to: "/services", search: {} })}
                  >
                    All services
                  </Button>
                }
              />
            )
          ) : (
            <ServiceLibrary
              services={services}
              formsAvailable={!forms.loadError}
              loading={loading}
              query={query}
              view={view}
              reviewKeys={reviewKeys}
              onQueryChange={setQuery}
              onViewChange={setView}
              unavailable={
                !!(forms.loadError || content.loadError) &&
                services.length === 0
              }
              onRetry={refresh}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
