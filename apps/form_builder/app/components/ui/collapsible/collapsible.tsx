import { Collapsible as CollapsibleBase } from "@base-ui/react/collapsible";
import { CaretDownIcon } from "@phosphor-icons/react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cn } from "../utils/cn";

export function collapsibleVariants() {
  return cn();
}
// =============================================================================
// Collapsible Root
// =============================================================================
type BaseRootProps = ComponentPropsWithoutRef<typeof CollapsibleBase.Root>;
export interface CollapsibleRootProps extends BaseRootProps {
  /** Additional CSS classes */
  className?: string;
}
function CollapsibleRoot({ className, ...props }: CollapsibleRootProps) {
  return <CollapsibleBase.Root className={className} {...props} />;
}
CollapsibleRoot.displayName = "Collapsible.Root";
// =============================================================================
// Collapsible Trigger
// =============================================================================
type BaseTriggerProps = ComponentPropsWithoutRef<
  typeof CollapsibleBase.Trigger
>;
export interface CollapsibleTriggerProps extends BaseTriggerProps {
  /** Additional CSS classes */
  className?: string;
}
const CollapsibleTrigger = forwardRef<
  HTMLButtonElement,
  CollapsibleTriggerProps
>(({ className, ...props }, ref) => {
  return (
    <CollapsibleBase.Trigger
      ref={ref}
      data-ui-component="Collapsible"
      data-ui-part="trigger"
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
});
CollapsibleTrigger.displayName = "Collapsible.Trigger";
// =============================================================================
// Collapsible Panel
// =============================================================================
type BasePanelProps = ComponentPropsWithoutRef<typeof CollapsibleBase.Panel>;
export interface CollapsiblePanelProps extends BasePanelProps {
  /** Additional CSS classes */
  className?: string;
}
const CollapsiblePanel = forwardRef<HTMLDivElement, CollapsiblePanelProps>(
  ({ className, ...props }, ref) => {
    return <CollapsibleBase.Panel ref={ref} className={className} {...props} />;
  },
);
CollapsiblePanel.displayName = "Collapsible.Panel";
// =============================================================================
// Default Trigger (Migration Affordance)
// =============================================================================
export interface CollapsibleDefaultTriggerProps {
  /** Label text displayed in the trigger */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}
const CollapsibleDefaultTrigger = forwardRef<
  HTMLButtonElement,
  CollapsibleDefaultTriggerProps
>(({ children, className }, ref) => {
  return (
    <CollapsibleBase.Trigger
      ref={ref}
      data-ui-component="Collapsible"
      data-ui-part="default-trigger"
      className={cn(
        // Defensive resets to prevent global button styles from polluting the trigger
        "m-0 border-none bg-transparent p-0 shadow-none",
        // Base styles for the trigger
        "flex cursor-pointer items-center gap-1 text-base font-medium text-ui-default select-none",
        className,
      )}
    >
      <span>{children}</span>
      <span className="inline-grid w-4 shrink-0 place-items-center">
        <CaretDownIcon
          aria-hidden
          size={12}
          weight="bold"
          className="block size-3 origin-center transition-transform duration-100 ease-out [[data-panel-open]_&]:rotate-180"
        />
      </span>
    </CollapsibleBase.Trigger>
  );
});
CollapsibleDefaultTrigger.displayName = "Collapsible.DefaultTrigger";
// =============================================================================
// Default Panel (Migration Affordance)
// =============================================================================
export interface CollapsibleDefaultPanelProps extends BasePanelProps {
  /** Panel content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}
const CollapsibleDefaultPanel = forwardRef<
  HTMLDivElement,
  CollapsibleDefaultPanelProps
>(({ children, className, ...props }, ref) => {
  return (
    <CollapsibleBase.Panel
      ref={ref}
      className={cn(
        "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-100 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden",
        className,
      )}
      {...props}
    >
      <div className="my-2 space-y-4 border-l-2 border-ui-tint py-1 pr-1 pl-4">
        {children}
      </div>
    </CollapsibleBase.Panel>
  );
});
CollapsibleDefaultPanel.displayName = "Collapsible.DefaultPanel";
// =============================================================================
// Compound Component Export
// =============================================================================
export const Collapsible = Object.assign(CollapsibleRoot, {
  Root: CollapsibleRoot,
  Trigger: CollapsibleTrigger,
  Panel: CollapsiblePanel,
  DefaultTrigger: CollapsibleDefaultTrigger,
  DefaultPanel: CollapsibleDefaultPanel,
});
// =============================================================================
// Type Exports
// =============================================================================
export type CollapsibleProps = CollapsibleRootProps;
