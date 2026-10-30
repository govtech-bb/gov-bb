import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { X } from "@phosphor-icons/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Bar } from "./bar";
import { Button } from "./button";
import { backdrop } from "./dialog";
import { InToolbar } from "./toolbar";
import { Tip } from "./tooltip";
import { useMediaQuery } from "./use-media-query";

/** Where a panel shows: beside the page on a wide screen, or as a drawer over it on a narrow one. */
export type DrawerPanel = {
  id: string;
  /** Beside the page, rather than a drawer over it. */
  wide: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
};

/**
 * Whether a panel shows, beside the page while `wideScreen` matches and as a drawer otherwise. The drawer starts
 * closed. Each keeps its own state, so a panel left open beside the page doesn't spring open over it when the window
 * narrows; `beside` holds the wide one, so its owner can start it closed or remember it.
 */
export function useDrawerPanel(
  wideScreen: string,
  [beside, setBeside]: readonly [boolean, (open: boolean) => void],
): DrawerPanel {
  const id = useId();
  const wide = useMediaQuery(wideScreen);
  const [drawer, setDrawer] = useState(false);
  const [wasWide, setWasWide] = useState(wide);

  if (wide !== wasWide) {
    setWasWide(wide);
    setDrawer(false);
  }

  return { id, wide, open: wide ? beside : drawer, setOpen: wide ? setBeside : setDrawer };
}

/**
 * Classes for a panel's column beside the page, which shows and hides with `hidden`. Folding away or opening, it eases
 * between its width and none, rather than moving the page by its width in one frame; its content keeps its own width,
 * clipped, so none of it re-wraps on the way. Not as it first shows, which would slide the page about as it loads, and
 * at once where motion isn't welcome.
 */
export function useColumnMotion() {
  const [shown, setShown] = useState(false);

  useEffect(() => setShown(true), []);

  return cn(
    "overflow-x-clip transition-[width,display] transition-discrete duration-(--duration-panel-in) ease-out-quint motion-reduce:transition-none [&[hidden]]:w-0 [&[hidden]]:duration-(--duration-panel-out)",
    shown && "starting:w-0",
  );
}

// It slides in from its edge, follows a swipe, and leaves quicker than it came
const slides = {
  start:
    "[transform:translateX(var(--drawer-swipe-movement-x,0px))] data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
  end: "[transform:translateX(var(--drawer-swipe-movement-x,0px))] data-starting-style:translate-x-full data-ending-style:translate-x-full",
};

/**
 * Shows and hides a panel, or opens its drawer: only an icon, at the edge of the panel it moves, where it reads as
 * part of the frame rather than one of the page's tools. Its tooltip says what a press does, such as “Hide pages”.
 */
export function PanelToggle({
  panel,
  label,
  icon,
  disabled,
}: {
  panel: DrawerPanel;
  /** What the panel holds, such as “Pages”: the button's name. */
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tip content={`${panel.open ? "Hide" : "Show"} ${label.toLowerCase()}`}>
      <Button
        icon={icon}
        aria-label={label}
        aria-expanded={panel.open}
        aria-controls={panel.open ? panel.id : undefined}
        disabled={disabled}
        onClick={() => panel.setOpen(!panel.open)}
        // The panel beside it says it's open: the button isn't tinted for it, as a menu's trigger is, until pointed at
        className="aria-expanded:not-hover:bg-transparent aria-expanded:not-hover:text-muted"
      />
    </Tip>
  );
}

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The screen edge it comes from: the start for navigation, the end for a document's settings. */
  side: "start" | "end";
  /** For the control that opens it, through `aria-controls`. */
  id?: string;
  /** Titles it. */
  label: string;
  /** Names its close button. */
  closeLabel?: string;
  /** Out of reach while what it holds can't be changed, such as while editing is paused. */
  inert?: boolean;
  children: ReactNode;
};

/** A panel over the dimmed page from one edge of the screen, under a title row with its close button. */
export function Drawer({
  open,
  onOpenChange,
  side,
  id,
  label,
  closeLabel = "Close",
  inert,
  children,
}: DrawerProps) {
  return (
    <BaseDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={side === "start" ? "left" : "right"}
    >
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className={backdrop} />
        <BaseDrawer.Viewport
          className={cn(
            "fixed inset-0 z-popup flex",
            side === "start" ? "justify-start" : "justify-end",
          )}
        >
          <BaseDrawer.Popup
            id={id}
            className={cn(
              "flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col bg-white text-14 text-ink shadow-popup outline-none",
              "transition-[translate,transform] duration-(--duration-drawer-in) ease-out-quint data-swiping:duration-0 data-ending-style:duration-(--duration-drawer-out) motion-reduce:transition-none",
              slides[side],
            )}
          >
            {/* Inset like the sections under it, rather than like the page's bars */}
            <Bar.Root className="shrink-0 flex-nowrap sm:px-4">
              <Bar.Title render={<BaseDrawer.Title />}>{label}</Bar.Title>
              <Bar.Actions className="-me-2">
                <BaseDrawer.Close render={<Button icon={<X />} aria-label={closeLabel} />} />
              </Bar.Actions>
            </Bar.Root>
            <BaseDrawer.Content
              inert={inert}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <InToolbar value={false}>{children}</InToolbar>
            </BaseDrawer.Content>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}
