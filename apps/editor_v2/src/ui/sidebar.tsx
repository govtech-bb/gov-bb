import { useRender } from "@base-ui/react/use-render";
import { SidebarSimple } from "@phosphor-icons/react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";
import { Drawer, useDrawerPanel, type DrawerPanel } from "./drawer";
import { EmptyState } from "./empty-state";
import { touchTarget } from "./surface";

// A column of navigation beside the page. Its header row is as tall as the toolbar beside it,
// so their rules meet; its items are 32px rows like a menu's, under 12px group labels, and 44px on a touch screen.

// Wide enough for the column beside the page (the theme's lg): narrower, it's a drawer
const wideScreen = "(min-width: 62rem)";

/** What the parts need from the sidebar: its label, and in a drawer the way to close it. */
const Place = createContext<{ label: string; closeDrawer?: () => void }>({ label: "" });

/** The rows' look, kept in one place: the current row is tinted and semibold. */
const item = `flex items-start gap-2 rounded-sm px-3 py-1.5 text-14 text-ink hover:bg-hover pointer-coarse:items-center aria-[current=page]:bg-blue-10 aria-[current=page]:font-semibold ${touchTarget}`;

/** Whether the column is open beside the page, remembered in this browser under `memory` when there is one. */
function useRememberedOpen(memory: string | undefined) {
  const [open, setOpen] = useState(() => {
    try {
      return !memory || localStorage.getItem(memory) === null;
    } catch {
      return true;
    }
  });

  const remember = (next: boolean) => {
    setOpen(next);

    if (!memory) return;

    try {
      if (next) localStorage.removeItem(memory);
      else localStorage.setItem(memory, "collapsed");
    } catch {
      // Without storage, the column stays as chosen until the page reloads
    }
  };

  return [open, remember] as const;
}

/**
 * Whether the sidebar shows. Beside the page it starts open, and collapsing it gives its width to the page; with a
 * `memory` key, this browser remembers that. On a narrow screen it's a drawer instead, which starts closed.
 */
export function useSidebar(memory?: string): DrawerPanel {
  return useDrawerPanel(wideScreen, useRememberedOpen(memory));
}

type RootProps = {
  sidebar: DrawerPanel;
  /** Names the navigation, and titles it. */
  label: string;
  children: ReactNode;
};

/**
 * The column, a navigation landmark. Beside the page its content stays in view as the page scrolls, and collapsed it
 * leaves the page its width. On a narrow screen it's a drawer from the start edge, which closes as a row or an action
 * is chosen.
 */
function SidebarRoot({ sidebar, label, children }: RootProps) {
  if (!sidebar.wide)
    return (
      <Place value={{ label, closeDrawer: () => sidebar.setOpen(false) }}>
        <Drawer
          open={sidebar.open}
          onOpenChange={sidebar.setOpen}
          side="start"
          id={sidebar.id}
          label={label}
        >
          <nav aria-label={label}>{children}</nav>
        </Drawer>
      </Place>
    );

  return (
    <Place value={{ label }}>
      <nav
        id={sidebar.id}
        aria-label={label}
        hidden={!sidebar.open}
        className="w-60 shrink-0 border-e border-line bg-white"
      >
        <div className="sticky top-0 max-h-dvh overflow-y-auto overscroll-contain">{children}</div>
      </nav>
    </Place>
  );
}

/** Shows and hides the sidebar: collapses the column beside the page, or opens the drawer. Tinted while it shows. */
function SidebarToggle({
  sidebar,
  variant = "ghost",
  children,
}: {
  sidebar: DrawerPanel;
  /** `inverse` on a dark bar. */
  variant?: ButtonVariant;
  /** Its words, such as what the sidebar lists. */
  children: ReactNode;
}) {
  return (
    <Button
      variant={variant}
      icon={<SidebarSimple />}
      aria-expanded={sidebar.open}
      aria-controls={sidebar.open ? sidebar.id : undefined}
      onClick={() => sidebar.setOpen(!sidebar.open)}
      className={
        variant === "inverse"
          ? "aria-expanded:bg-white/15"
          : "aria-expanded:bg-tint aria-expanded:text-ink"
      }
    >
      {children}
    </Button>
  );
}

/**
 * The title row, the sidebar's label as tall as a toolbar, with anything else it needs at its end. A drawer has its
 * own title row instead.
 */
function SidebarHeader({ children }: { children?: ReactNode }) {
  const { label, closeDrawer } = useContext(Place);

  if (closeDrawer) return null;

  return (
    <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line px-4 text-14 font-semibold">
      {label}
      {children}
    </div>
  );
}

/** The groups, notes and actions under the header. */
function SidebarContent({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-4 pb-6">{children}</div>;
}

/** Rows that belong together, under an optional label that names their list. */
function SidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
  const id = useId();

  return (
    <>
      {label && (
        <h2 id={id} className="mb-1 px-3 text-12 font-semibold text-muted">
          {label}
        </h2>
      )}
      <ul aria-labelledby={label ? id : undefined} className="flex flex-col gap-1">
        {children}
      </ul>
    </>
  );
}

type ItemProps = {
  /** The row for the page on screen. */
  current?: boolean;
  /** At the row's end, level with its first line: a status, such as a labelled StatusDot. */
  status?: ReactNode;
  /** Items for what sits under this row, listed beneath it and indented a step. */
  nested?: ReactNode;
  /** The row's link, such as the router's own; a plain link by default. It gets the row's look and state. */
  render?: useRender.RenderProp;
  children: ReactNode;
};

/** A row of a group: a link, marked as the current page while its page is on screen. */
function SidebarItem({ current = false, status, nested, render, children }: ItemProps) {
  const { closeDrawer } = useContext(Place);

  const element = useRender({
    render,
    defaultTagName: "a",
    props: {
      className: item,
      "aria-current": current ? "page" : undefined,
      onClick: closeDrawer,
      children: (
        <>
          <span className="min-w-0 flex-1 wrap-break-word">{children}</span>
          {status && <span className="flex h-5 shrink-0 items-center">{status}</span>}
        </>
      ),
    },
  });

  return (
    <li>
      {element}
      {nested && <ul className="mt-1 flex flex-col gap-1 ps-4">{nested}</ul>}
    </li>
  );
}

/** Rules off what follows from the groups above. */
function SidebarSeparator() {
  return <hr className="my-4 border-line" />;
}

/** What a group would show had it any rows, such as the first thing to add. */
function SidebarEmpty({ children }: { children: ReactNode }) {
  return <EmptyState size="inline" title={children} className="px-3 py-1.5" />;
}

/** Buttons for what the column's things can do, under its groups. In a drawer, choosing one closes it. */
function SidebarActions({ children }: { children: ReactNode }) {
  const { closeDrawer } = useContext(Place);

  return (
    <div
      className="mt-6 flex flex-wrap gap-2"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) closeDrawer?.();
      }}
    >
      {children}
    </div>
  );
}

/**
 * A navigation column. `useSidebar` holds whether it shows and Toggle goes in the page's bar; Root names it, Header
 * titles it, and Content holds Groups of Items, Separators, an Empty note and Actions.
 */
export const Sidebar = {
  Root: SidebarRoot,
  Toggle: SidebarToggle,
  Header: SidebarHeader,
  Content: SidebarContent,
  Group: SidebarGroup,
  Item: SidebarItem,
  Separator: SidebarSeparator,
  Empty: SidebarEmpty,
  Actions: SidebarActions,
};
