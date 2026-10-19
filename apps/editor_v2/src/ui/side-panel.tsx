import { SidebarSimple } from "@phosphor-icons/react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Drawer, useDrawerPanel, type DrawerPanel } from "./drawer";
import { Tip } from "./tooltip";
import { wideScreen } from "./use-media-query";

// A section is titled a level under what holds it: the document's h1 beside the page, the drawer's own h2 title
const SectionHeading = createContext<"h2" | "h3">("h2");

export type SidePanelState = DrawerPanel;

/** Whether a document's side panel shows. Beside the canvas it starts open; as a drawer it starts closed. */
export function useSidePanel(): SidePanelState {
  return useDrawerPanel(wideScreen, useState(true));
}

/** Shows and hides the panel, from the document's toolbar. The panel beside the page, or over it, shows it's open. */
function SidePanelToggle({
  panel,
  label,
  disabled,
}: {
  panel: SidePanelState;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Tip content={label}>
      <Button
        icon={<SidebarSimple mirrored />}
        aria-label={label}
        aria-expanded={panel.open}
        aria-controls={panel.open ? panel.id : undefined}
        disabled={disabled}
        onClick={() => panel.setOpen(!panel.open)}
      />
    </Tip>
  );
}

type RootProps = {
  panel: SidePanelState;
  /** Names the panel, and titles it as a drawer. */
  label: string;
  /** Out of reach while the document can't be edited, such as while editing is paused. */
  inert?: boolean;
  /** Its sections. */
  children: ReactNode;
};

/**
 * A document's settings: beside the canvas on a wide screen, where they stay in view as the page
 * scrolls, and a drawer from the end edge on a narrow one, which can be swiped away.
 */
function SidePanelRoot({ panel, label, inert, children }: RootProps) {
  if (panel.wide)
    return (
      <aside
        id={panel.id}
        aria-label={label}
        hidden={!panel.open}
        inert={inert}
        className="w-80 shrink-0 border-s border-line bg-white text-14 text-ink"
      >
        {/* In view as the page scrolls, under the document's bar pinned above it */}
        <div className="sticky top-(--bar-height) max-h-[calc(100dvh-var(--bar-height))] overflow-y-auto overscroll-contain">
          <SectionHeading value="h2">{children}</SectionHeading>
        </div>
      </aside>
    );

  return (
    <Drawer
      open={panel.open}
      onOpenChange={panel.setOpen}
      side="end"
      id={panel.id}
      label={label}
      inert={inert}
    >
      <SectionHeading value="h3">{children}</SectionHeading>
    </Drawer>
  );
}

/** Settings that belong together, under a title a level below the panel's own. Sections are ruled off from each other. */
function SidePanelSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId();
  const Heading = useContext(SectionHeading);

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-line p-4 not-last:border-b">
      <Heading id={id} className="text-16 font-semibold">
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** The document's side panel: `useSidePanel` holds its state, Toggle goes in the toolbar, Root holds Sections. */
export const SidePanel = {
  Root: SidePanelRoot,
  Toggle: SidePanelToggle,
  Section: SidePanelSection,
};
