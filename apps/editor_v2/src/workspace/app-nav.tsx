import { Checks, Files, Folders } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { DrawerPanel } from "../ui/drawer";
import { Sidebar } from "../ui/sidebar";
import type { ServicesSearch } from "./services-search";

/** The editor's grouped menu: a rail beside service pages, a drawer on narrow screens. */
export function AppNav({
  sidebar,
  rail,
  servicesSearch,
}: {
  /** Whether it shows, beside the page or as a drawer: `useSidebar`. */
  sidebar: DrawerPanel;
  rail: boolean;
  /** The Services list's search, filters and page, kept as the author left them. */
  servicesSearch: ServicesSearch;
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <Sidebar.Root sidebar={sidebar} label="Menu" rail={rail}>
      <Sidebar.Content>
        <Sidebar.Group label="Content">
          <Sidebar.Item
            icon={<Files />}
            current={path === "/services" || path.startsWith("/services/")}
            render={<Link to="/services" search={servicesSearch} />}
          >
            Services
          </Sidebar.Item>
          <Sidebar.Item
            icon={<Checks />}
            current={path === "/reviews" || path.startsWith("/reviews/")}
            render={<Link to="/reviews" />}
          >
            Review queue
          </Sidebar.Item>
        </Sidebar.Group>
        <Sidebar.Group label="Manage">
          <Sidebar.Item
            icon={<Folders />}
            current={path === "/categories"}
            render={<Link to="/categories" />}
          >
            Categories
          </Sidebar.Item>
        </Sidebar.Group>
      </Sidebar.Content>
    </Sidebar.Root>
  );
}
