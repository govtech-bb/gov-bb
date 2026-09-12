import { Link, useRouterState } from "@tanstack/react-router";
import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useRef,
  type ReactNode,
} from "react";
import {
  FileTextIcon,
  HouseIcon,
  ListChecksIcon,
  ListIcon,
  MoonIcon,
  SparkleIcon,
  StackIcon,
  SunIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useGlobalAssistant, WorkspaceAssistant } from "./global-assistant";
import { useTheme } from "../hooks/use-theme";
import { servicePageLabel } from "./services/service-model";
import { serviceTabs } from "./services/service-state";
import { Button } from "./ui/button";
import { Breadcrumbs } from "./ui/breadcrumbs";
import { Sidebar, useSidebar } from "./ui/sidebar";
import { Tooltip } from "./ui/tooltip";
import {
  LinkProvider,
  type LinkComponentProps,
} from "./ui/utils/link-provider";

const NAVIGATION = [
  { key: "services", label: "Services", href: "/services", icon: StackIcon },
] as const;

const NavigationLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  function NavigationLink({ href, ...props }, ref) {
    const [path, query] = (href ?? "/services").split("?");
    const search = Object.fromEntries(new URLSearchParams(query));
    return (
      <Link ref={ref} to={path as "/services"} search={search} {...props} />
    );
  },
);

interface AppShellProps {
  section: "services" | "builder" | "content";
  service?: {
    key: string;
    title: string;
    formId?: string;
    pages?: {
      path: string;
      title: string;
      kind?: string;
      isLocalDraft?: boolean;
    }[];
  };
  user: string;
  title?: string;
  children: ReactNode;
  assistant?: ReactNode;
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
  assistantDisabled?: boolean;
}

export function AppShell(props: AppShellProps) {
  return (
    <Sidebar.Provider
      contained
      onOpenChange={(open) => {
        try {
          localStorage.setItem("workspace:sidebar-open", String(open));
        } catch {
          // Navigation still works when browser storage is unavailable.
        }
      }}
      className="h-dvh min-h-0 overflow-hidden bg-ui-canvas font-sans text-ui-default"
    >
      <AppShellLayout {...props} />
    </Sidebar.Provider>
  );
}

function AppShellLayout({
  service,
  user,
  title,
  children,
  assistant,
  assistantOpen,
  onToggleAssistant,
  assistantDisabled,
}: AppShellProps) {
  const { isMobile, openMobile, setOpen, setOpenMobile } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const globalAssistant = useGlobalAssistant();
  const location = useRouterState({ select: (state) => state.location });
  const href = location.href;
  const pagePath =
    new URLSearchParams(location.searchStr).get("path") ??
    new URLSearchParams(location.searchStr).get("createPath");
  const mainRef = useRef<HTMLElement>(null);
  const current = NAVIGATION[0];
  const restoreSidebar = useEffectEvent(() => {
    try {
      setOpen(localStorage.getItem("workspace:sidebar-open") !== "false");
    } catch {
      // Use the expanded rail if browser storage is unavailable.
    }
  });
  const focusPage = useEffectEvent(() => {
    setOpenMobile(false);
    const frame = requestAnimationFrame(() =>
      mainRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => restoreSidebar(), []);
  useEffect(() => focusPage(), [href]);

  return (
    <>
      <a
        href="#workspace-main"
        inert={isMobile && openMobile}
        className="sr-only z-50 rounded-lg bg-ui-brand px-4 py-3 text-ui-inverse focus:not-sr-only focus:absolute focus:start-4 focus:top-4"
      >
        Skip to workspace
      </a>
      <Sidebar role="navigation" aria-label="Workspace" className="z-40">
        <Sidebar.Header>
          <Link
            to="/services"
            search={{}}
            aria-label="GovTech Barbados services"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-ui-default no-underline focus-visible:outline-2 focus-visible:outline-ui-focus"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-ui-brand text-lg font-semibold text-ui-inverse"
            >
              G
            </span>
            <span className="min-w-0 group-data-[state=collapsed]/sidebar:hidden">
              <span className="block truncate text-sm font-semibold">
                GovTech Barbados
              </span>
              <span className="block truncate text-xs text-ui-subtle">
                Service workspace
              </span>
            </span>
          </Link>
          {isMobile && <Sidebar.Close />}
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
            <LinkProvider component={NavigationLink}>
              <Sidebar.Menu>
                {NAVIGATION.map((item) => (
                  <Sidebar.MenuButton
                    key={item.key}
                    href={item.href}
                    icon={<item.icon size={18} aria-hidden="true" />}
                    active={!service}
                    aria-current={!service ? "page" : undefined}
                    tooltip={item.label}
                    className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus"
                  >
                    {item.label}
                  </Sidebar.MenuButton>
                ))}
              </Sidebar.Menu>
            </LinkProvider>
          </Sidebar.Group>
          {service && (
            <Sidebar.Group>
              <Sidebar.GroupLabel>{service.title}</Sidebar.GroupLabel>
              <LinkProvider component={NavigationLink}>
                <Sidebar.Menu>
                  {serviceTabs.map(([key, label]) => {
                    const currentTab =
                      new URLSearchParams(location.searchStr).get("tab") ??
                      "overview";
                    const active =
                      location.pathname === "/services"
                        ? currentTab === key
                        : key === "form" &&
                          location.pathname.startsWith("/builder");
                    return (
                      <Sidebar.MenuButton
                        key={key}
                        href={
                          key === "form" && service.formId
                            ? `/builder?formId=${encodeURIComponent(service.formId)}&service=${encodeURIComponent(service.key)}`
                            : `/services?service=${encodeURIComponent(service.key)}&tab=${key}`
                        }
                        active={active}
                        aria-current={active ? "page" : undefined}
                        icon={
                          key === "overview" ? (
                            <HouseIcon size={18} />
                          ) : key === "form" ? (
                            <ListChecksIcon size={18} />
                          ) : (
                            <FileTextIcon size={18} />
                          )
                        }
                        tooltip={label}
                      >
                        {label}
                      </Sidebar.MenuButton>
                    );
                  })}
                  {service.pages?.map((page) => (
                    <Sidebar.MenuButton
                      key={page.path}
                      href={`/content/edit?${page.isLocalDraft ? "createPath" : "path"}=${encodeURIComponent(page.path)}&service=${encodeURIComponent(service.key)}`}
                      active={pagePath === page.path}
                      aria-current={pagePath === page.path ? "page" : undefined}
                      icon={<FileTextIcon size={18} aria-hidden="true" />}
                      tooltip={`${servicePageLabel(page)} · ${page.title || "Untitled page"}`}
                    >
                      {servicePageLabel(page)}
                    </Sidebar.MenuButton>
                  ))}
                </Sidebar.Menu>
              </LinkProvider>
            </Sidebar.Group>
          )}
        </Sidebar.Content>
        <Sidebar.Footer>
          <Sidebar.Trigger />
        </Sidebar.Footer>
      </Sidebar>
      <div className="@container/shell flex min-h-0 min-w-0 flex-1">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          inert={isMobile && openMobile}
        >
          <header className="@container flex h-14.5 shrink-0 items-center gap-2 border-b border-ui-hairline bg-ui-canvas px-4">
            {isMobile && (
              <Sidebar.Trigger
                aria-label="Workspace"
                className="h-11 w-auto gap-2 px-2 text-sm"
              >
                <ListIcon size={18} aria-hidden="true" />
                <span>Workspace</span>
              </Sidebar.Trigger>
            )}
            {title ? (
              <LinkProvider component={NavigationLink}>
                <Breadcrumbs className="m-0 flex-1">
                  <Breadcrumbs.Link href={current.href}>
                    {current.label}
                  </Breadcrumbs.Link>
                  <Breadcrumbs.Separator />
                  {service && (
                    <Breadcrumbs.Link
                      href={`/services?service=${encodeURIComponent(service.key)}`}
                    >
                      {service.title}
                    </Breadcrumbs.Link>
                  )}
                  {service && <Breadcrumbs.Separator />}
                  <Breadcrumbs.Current>{title}</Breadcrumbs.Current>
                </Breadcrumbs>
              </LinkProvider>
            ) : (
              <nav
                className="flex min-w-0 items-center gap-2 text-sm font-medium"
                aria-label="Current section"
              >
                <current.icon
                  size={18}
                  className="shrink-0 text-ui-subtle"
                  aria-hidden="true"
                />
                <span className="truncate">{current.label}</span>
              </nav>
            )}
            <div className="ms-auto flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Ask AI"
                aria-expanded={assistantOpen ?? globalAssistant.open}
                disabled={assistantDisabled}
                onClick={
                  onToggleAssistant ??
                  (() => globalAssistant.setOpen((open) => !open))
                }
                icon={<SparkleIcon aria-hidden="true" />}
              >
                <span className="hidden @min-[28rem]:inline">Ask AI</span>
              </Button>
              <Tooltip
                asChild
                content={theme === "light" ? "Dark mode" : "Light mode"}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label={theme === "light" ? "Dark mode" : "Light mode"}
                  onClick={toggleTheme}
                  icon={
                    theme === "light" ? (
                      <MoonIcon aria-hidden="true" />
                    ) : (
                      <SunIcon aria-hidden="true" />
                    )
                  }
                />
              </Tooltip>
              <Tooltip asChild content={`Signed in as ${user}`}>
                <span
                  role="img"
                  aria-label={`Signed in as ${user}`}
                  tabIndex={0}
                  className="ms-1 flex size-8 items-center justify-center rounded-full bg-ui-tint text-ui-subtle focus-visible:outline-2 focus-visible:outline-ui-focus"
                >
                  <UserCircleIcon size={20} aria-hidden="true" />
                </span>
              </Tooltip>
            </div>
          </header>
          <main
            ref={mainRef}
            id="workspace-main"
            tabIndex={-1}
            className="@container min-h-0 flex-1 overflow-hidden outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-focus"
          >
            {children}
          </main>
        </div>
        {assistant ?? (
          <WorkspaceAssistant
            user={user}
            kind="content"
            documentId={service?.key ?? "workspace"}
            document={{
              title: service?.title ?? "Service library",
              workspace: true,
              service,
              instructions:
                "Help plan services and answer questions. A service owns one application form and multiple content pages. Open a page or form to propose edits.",
            }}
            revisionSource={service?.key ?? "workspace"}
            readOnly
            open={globalAssistant.open}
            onOpenChange={globalAssistant.setOpen}
            prepare={async () => {
              throw new Error("Open a content page or form to apply changes.");
            }}
          />
        )}
      </div>
    </>
  );
}
