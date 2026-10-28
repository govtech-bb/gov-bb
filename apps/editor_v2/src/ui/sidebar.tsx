import { useRender } from "@base-ui/react/use-render";
import { IconContext, SidebarSimple } from "@phosphor-icons/react";
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Button, type ButtonVariant } from "./button";
import { Drawer, PanelToggle, useDrawerPanel, type DrawerPanel } from "./drawer";
import { EmptyState } from "./empty-state";
import { touchTarget } from "./surface";
import { Tip } from "./tooltip";

// A column of navigation beside the page. Its header row is as tall as the toolbar beside it,
// so their rules meet; its items are 32px rows like a menu's, under 12px group labels, and 44px on a touch screen.
// Folded to a rail, it keeps only its items' icons, each named by a tooltip.

// Wide enough for the column beside the page (the theme's lg): narrower, it's a drawer
const wideScreen = "(min-width: 62rem)";

/** What the parts need from the sidebar: its label, whether it's a rail, and in a drawer the way to close it. */
const Place = createContext<{ label: string; rail?: boolean; closeDrawer?: () => void }>({
  label: "",
});

/** The rows' look, kept in one place: the current row is tinted and semibold. Held down, a row is pressed in. */
const item = `flex items-start gap-2 rounded-sm px-3 py-1.5 text-14 text-ink hover:bg-hover active:bg-hover active:shadow-press pointer-coarse:items-center aria-[current=page]:bg-blue-10 aria-[current=page]:font-semibold ${touchTarget}`;

/** A rail's rows: a square around the icon alone, tinted like a row while it's current. */
const railItem = `mx-auto flex size-10 items-center justify-center rounded-sm text-muted hover:bg-hover hover:text-ink active:bg-hover active:text-ink active:shadow-press aria-[current=page]:bg-blue-10 aria-[current=page]:text-ink [&_svg]:size-5 ${touchTarget}`;

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
  /** Beside the page, only its items' icons, leaving the room to a column beside it. A drawer always shows it all. */
  rail?: boolean;
  children: ReactNode;
};

/**
 * The column, a navigation landmark. Beside the page its content stays in view as the page scrolls, and collapsed it
 * leaves the page its width. On a narrow screen it's a drawer from the start edge, which closes as a row or an action
 * is chosen.
 */
function SidebarRoot({ sidebar, label, rail = false, children }: RootProps) {
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
    <Place value={{ label, rail }}>
      <nav
        id={sidebar.id}
        aria-label={label}
        hidden={!sidebar.open}
        className={cn("shrink-0 border-e border-line bg-white", rail ? "w-14" : "w-60")}
      >
        <div className="sticky top-0 max-h-dvh overflow-y-auto overscroll-contain">{children}</div>
      </nav>
    </Place>
  );
}

/**
 * Shows and hides the sidebar: collapses the column beside the page, or opens the drawer. With words, such as Menu on
 * the app's bar, it's a button that's tinted while the sidebar shows. Without them it's the column's own panel
 * toggle, an icon at its edge: in its header while it shows, and at the start of the page's bar while it's hidden.
 */
function SidebarToggle({
  sidebar,
  variant = "ghost",
  icon = <SidebarSimple />,
  label,
  children,
}: {
  sidebar: DrawerPanel;
  /** `inverse` on a dark bar. */
  variant?: ButtonVariant;
  /** A column beside the page by default; another, such as a menu's, where that would be ambiguous. */
  icon?: ReactNode;
} & ({ children: ReactNode; label?: never } | { label: string; children?: never })) {
  if (label !== undefined) return <PanelToggle panel={sidebar} label={label} icon={icon} />;

  return (
    <Button
      variant={variant}
      icon={icon}
      aria-expanded={sidebar.open}
      aria-controls={sidebar.open ? sidebar.id : undefined}
      onClick={() => sidebar.setOpen(!sidebar.open)}
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
  const { rail } = useContext(Place);

  return <div className={rail ? "py-2" : "px-4 pt-4 pb-6"}>{children}</div>;
}

/**
 * Rows that belong together, under an optional label that names their list. In a rail the label is left to screen
 * readers, and a rule sets each later group apart.
 */
function SidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
  const { rail } = useContext(Place);
  const id = useId();

  return (
    <>
      {label && (
        <h2
          id={id}
          className={rail ? "sr-only" : "mb-1 px-3 text-12 font-semibold text-muted not-first:mt-6"}
        >
          {label}
        </h2>
      )}
      <ul
        aria-labelledby={label ? id : undefined}
        className={cn(
          "flex flex-col gap-1",
          rail &&
            "mx-1 border-line not-first-of-type:mt-2 not-first-of-type:border-t not-first-of-type:pt-2",
        )}
      >
        {children}
      </ul>
    </>
  );
}

type ItemProps = {
  /** The row for the page on screen. */
  current?: boolean;
  /** Before its words, level with their first line: what the row leads to. In a rail, it's all that shows. */
  icon?: ReactNode;
  /** At the row's end, level with its first line: a status, such as a labelled StatusDot. Not shown in a rail. */
  status?: ReactNode;
  /** Items for what sits under this row, listed beneath it and indented a step. Not shown in a rail. */
  nested?: ReactNode;
  /** The row's link, such as the router's own; a plain link by default. It gets the row's look and state. */
  render?: useRender.RenderProp;
  children: ReactNode;
};

/**
 * A row of a group: a link, marked as the current page while its page is on screen, its icon filled. In a rail it's
 * the icon alone, named by its words for screen readers and in a tooltip.
 */
function SidebarItem({ current = false, icon, status, nested, render, children }: ItemProps) {
  const { rail, closeDrawer } = useContext(Place);
  const icons = useContext(IconContext);

  const iconStyle = useMemo(
    () => (current ? { ...icons, weight: "fill" as const } : icons),
    [current, icons],
  );

  const mark = icon && <IconContext.Provider value={iconStyle}>{icon}</IconContext.Provider>;

  const element = useRender({
    render,
    defaultTagName: "a",
    props: {
      className: rail ? railItem : item,
      "aria-current": current ? "page" : undefined,
      onClick: closeDrawer,
      children: rail ? (
        <>
          {mark}
          <span className="sr-only">{children}</span>
        </>
      ) : (
        <>
          {mark && (
            <span
              className={cn(
                "flex h-5 shrink-0 items-center [&_svg]:size-4",
                current ? "text-ink" : "text-muted",
              )}
            >
              {mark}
            </span>
          )}
          <span className="min-w-0 flex-1 wrap-break-word">{children}</span>
          {status && <span className="flex h-5 shrink-0 items-center">{status}</span>}
        </>
      ),
    },
  });

  // The same link either way, so folding to a rail or opening out, as a screen changes, keeps its focus
  return (
    <li>
      <Tip content={children} side="right" disabled={!rail}>
        {element}
      </Tip>
      {nested && !rail && <ul className="mt-1 flex flex-col gap-1 ps-4">{nested}</ul>}
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
 * A navigation column. `useSidebar` holds whether it shows and Toggle goes in the page's bar; Root names it, or folds
 * it to a rail of icons, Header titles it, and Content holds Groups of Items, Separators, an Empty note and Actions.
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
