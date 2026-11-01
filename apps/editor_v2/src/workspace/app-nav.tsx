import { Checks, Database, Files, Folders } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { DrawerPanel } from "../ui/drawer";
import { Sidebar } from "../ui/sidebar";
import type { ServicesSearch } from "./services-search";

/** The editor's grouped menu: a rail beside service pages, a drawer on narrow screens. */
export function AppNav({
  sidebar,
  rail,
  servicesSearch,
  account,
}: {
  /** Whether it shows, beside the page or as a drawer: `useSidebar`. */
  sidebar: DrawerPanel;
  rail: boolean;
  /** The Services list's search, filters and page, kept as the author left them. */
  servicesSearch: ServicesSearch;
  /** Who's signed in and Sign out: at the drawer's foot on a phone, where the app's bar has no room for them. */
  account?: ReactNode;
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
          <Sidebar.Item
            icon={<Database />}
            current={path === "/collections" || path.startsWith("/collections/")}
            render={<Link to="/collections" />}
          >
            Collections
          </Sidebar.Item>
        </Sidebar.Group>
        {!sidebar.wide && account && (
          <div className="mt-6 border-t border-line px-3 pt-4 sm:hidden">{account}</div>
        )}
      </Sidebar.Content>
    </Sidebar.Root>
  );
}
