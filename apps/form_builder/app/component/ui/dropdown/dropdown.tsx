import { Elevated } from "../surface/elevation";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { cn } from "../utils/cn";
import { ListHighlight, SelectionCheck } from "../animation";
import { useLinkComponent } from "../utils/link-provider";
import {
  usePortalContainer,
  type PortalContainer,
} from "../utils/portal-provider";
import { CaretRightIcon as CaretRight, type Icon } from "@phosphor-icons/react";
/** Dropdown item variant definitions (default and danger styles). */
const dropdownStyles = {
  variant: {
    default: "",
    danger:
      "text-ui-danger data-highlighted:bg-ui-danger/5 data-highlighted:text-ui-danger",
  },
} as const;
export type DropdownVariant = keyof typeof dropdownStyles.variant;
export interface DropdownVariantsProps {
  /**
   * Visual style of the dropdown item.
   * - `"default"` — Standard item appearance
   * - `"danger"` — Destructive action with red text
   * @default "default"
   */
  variant?: DropdownVariant;
}
export function dropdownVariants({
  variant = "default",
}: DropdownVariantsProps = {}) {
  return cn(
    dropdownStyles.variant[variant] ?? dropdownStyles.variant["default"],
  );
}
const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubmenuTrigger>,
  React.ComponentPropsWithoutRef<
    typeof DropdownMenuPrimitive.SubmenuTrigger
  > & {
    inset?: boolean;
    icon?: Icon;
  }
>(({ className, inset, children, icon: IconComponent, ...props }, ref) => (
  <DropdownMenuPrimitive.SubmenuTrigger
    ref={ref}
    data-ui-component="DropdownMenu"
    data-ui-part="submenu-trigger"
    className={cn(
      "flex cursor-default items-center rounded-sm text-base outline-hidden select-none", // base styles
      "px-2 py-1.5", // spacing
      "focus:bg-ui-tint focus:ring-ui-focus/50 focus-visible:ring-2 focus-visible:ring-ui-brand", // focus state
      "data-[state=open]:bg-ui-tint", // open state
      inset && "pl-8", // conditional inset
      className,
    )}
    {...props}
  >
    {IconComponent && <IconComponent className="mr-2 h-4 w-4" />}
    {children}
    <CaretRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubmenuTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubmenuTrigger.displayName;
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Positioner>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Positioner> & {
    container?: PortalContainer;
    finalFocus?: React.ComponentPropsWithoutRef<
      typeof DropdownMenuPrimitive.Popup
    >["finalFocus"];
  }
>(
  (
    {
      className,
      sideOffset = 8,
      children,
      container: containerProp,
      finalFocus,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const contextContainer = usePortalContainer();
    const container = containerProp ?? contextContainer ?? undefined;
    return (
      <DropdownMenuPrimitive.Portal container={container}>
        <DropdownMenuPrimitive.Positioner
          ref={ref}
          className="z-50"
          sideOffset={sideOffset}
          {...props}
        >
          <DropdownMenuPrimitive.Popup
            finalFocus={finalFocus}
            aria-label={ariaLabel}
            render={
              <Elevated offset={2} shadowLevel={3} render={<ListHighlight />} />
            }
            className={cn(
              "ui-popup ui-dropdown-popup overflow-hidden text-ui-default", // background
              "max-h-[var(--available-height)] ui-scroll-native overflow-y-auto", // limit height when list is too long and might go off screen
              // border part
              "min-w-36 p-1.5", // spacing
              className,
            )}
          >
            {children}
          </DropdownMenuPrimitive.Popup>
        </DropdownMenuPrimitive.Positioner>
      </DropdownMenuPrimitive.Portal>
    );
  },
);
const renderIconNode = (IconComponent?: Icon | React.ReactNode) => {
  if (!IconComponent) return null;
  if (React.isValidElement(IconComponent)) return IconComponent;
  const Comp = IconComponent as React.ComponentType<Record<string, unknown>>;
  return <Comp className="mr-2 h-4 w-4" />;
};
const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    icon?: Icon | React.ReactNode;
    selected?: boolean;
    href?: string;
    variant?: "default" | "danger";
  }
>(
  (
    {
      className,
      inset,
      icon: IconComponent,
      children,
      selected,
      render,
      href,
      variant = "default",
      ...props
    },
    ref,
  ) => {
    const LinkComponent = useLinkComponent();
    // Build the inner content with icon, children, and selected indicator
    const innerContent = React.useMemo(
      () => (
        <>
          {IconComponent && renderIconNode(IconComponent)}
          {children}
          {selected && (
            <span className="inline-flex size-4">
              <SelectionCheck />
            </span>
          )}
        </>
      ),
      [IconComponent, children, selected],
    );
    // Legacy href support (deprecated)
    const linkContent = React.useMemo(() => {
      if (!href) return undefined;
      // Matches http://, https://, or protocol-relative //
      const isExternal = /^(https?:)?\/\//.test(href);
      const styles = cn(
        "flex items-center",
        variant === "danger" &&
          "text-ui-danger data-highlighted:bg-ui-danger/5 data-highlighted:text-ui-danger",
      );
      if (isExternal) {
        return (
          <a
            className={cn(styles, "w-full text-inherit! no-underline!")}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {innerContent}
          </a>
        );
      }
      return (
        <LinkComponent
          className={cn(styles, "w-full text-inherit! no-underline!")}
          href={href}
          onClick={(e) => e.stopPropagation()}
        >
          {innerContent}
        </LinkComponent>
      );
    }, [href, innerContent, variant, LinkComponent]);
    // When href is provided, use linkContent as render prop
    // When render prop is provided, caller controls children rendering
    const useRenderProp = href || render;
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        data-ui-component="DropdownMenu"
        data-ui-part="item"
        data-selected={selected || undefined}
        className={cn(
          "relative flex cursor-default items-center rounded-md px-2 py-1.5 text-base outline-hidden select-none focus:text-ui-default focus:ring-ui-focus/50 focus-visible:ring-2 focus-visible:ring-ui-brand data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-ui-tint",
          inset && "pl-8",
          dropdownVariants({ variant }),
          className,
        )}
        render={href ? linkContent : render}
        {...props}
      >
        {useRenderProp ? undefined : innerContent}
      </DropdownMenuPrimitive.Item>
    );
  },
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
const DropdownMenuLinkItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.LinkItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.LinkItem> & {
    inset?: boolean;
    icon?: Icon | React.ReactNode;
    variant?: "default" | "danger";
  }
>(
  (
    {
      className,
      inset,
      icon: IconComponent,
      children,
      variant = "default",
      ...props
    },
    ref,
  ) => {
    return (
      <DropdownMenuPrimitive.LinkItem
        ref={ref}
        data-ui-component="DropdownMenu"
        data-ui-part="link-item"
        className={cn(
          "relative flex cursor-default items-center rounded-md px-2 py-1.5 text-base outline-hidden select-none",
          "focus:text-ui-default focus:ring-ui-focus/50 focus-visible:ring-2 focus-visible:ring-ui-brand data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-ui-tint",
          "text-inherit no-underline",
          inset && "pl-8",
          dropdownVariants({ variant }),
          className,
        )}
        {...props}
      >
        {IconComponent && renderIconNode(IconComponent)}
        {children}
      </DropdownMenuPrimitive.LinkItem>
    );
  },
);
DropdownMenuLinkItem.displayName = "DropdownMenuLinkItem";
const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    data-ui-component="DropdownMenu"
    data-ui-part="checkbox-item"
    className={cn(
      "relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-base outline-hidden transition-colors select-none focus:bg-ui-tint focus:text-ui-default focus:ring-ui-focus/50 focus-visible:ring-2 focus-visible:ring-ui-brand data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    checked={checked}
    {...props}
  >
    <DropdownMenuPrimitive.CheckboxItemIndicator
      keepMounted
      className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-inherit"
    >
      <SelectionCheck />
    </DropdownMenuPrimitive.CheckboxItemIndicator>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;
const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.GroupLabel>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.GroupLabel> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.GroupLabel
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-base font-semibold",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.GroupLabel.displayName;
const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-ui-hairline", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";
const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    inset?: boolean;
    icon?: Icon | React.ReactNode;
  }
>(({ className, children, inset, icon: IconComponent, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    data-ui-component="DropdownMenu"
    data-ui-part="radio-item"
    className={cn(
      "relative flex cursor-default items-center rounded-md px-2 py-1.5 text-base outline-hidden select-none",
      "data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-ui-tint",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {IconComponent && renderIconNode(IconComponent)}
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";
const DropdownMenuRadioItemIndicator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItemIndicator>,
  React.ComponentPropsWithoutRef<
    typeof DropdownMenuPrimitive.RadioItemIndicator
  >
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItemIndicator
    ref={ref}
    keepMounted={children == null}
    className={cn("ml-auto size-4", className)}
    {...props}
  >
    {children ?? <SelectionCheck />}
  </DropdownMenuPrimitive.RadioItemIndicator>
));
DropdownMenuRadioItemIndicator.displayName = "DropdownMenuRadioItemIndicator";
const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ children, render, ...props }, ref) => {
  // If render prop is explicitly provided, use it and pass children through
  if (render) {
    return (
      <DropdownMenuPrimitive.Trigger ref={ref} {...props} render={render}>
        {children}
      </DropdownMenuPrimitive.Trigger>
    );
  }
  // Otherwise, auto-promote single child element to render prop
  const childElement = React.isValidElement(children) ? children : null;
  return (
    <DropdownMenuPrimitive.Trigger
      ref={ref}
      {...props}
      {...(childElement && {
        render: childElement as React.ReactElement<Record<string, unknown>>,
      })}
    >
      {childElement ? undefined : children}
    </DropdownMenuPrimitive.Trigger>
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";
export const DropdownMenu = Object.assign(DropdownMenuPrimitive.Root, {
  Trigger: DropdownMenuTrigger,
  Portal: DropdownMenuPrimitive.Portal,
  Sub: DropdownMenuPrimitive.SubmenuRoot,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuContent,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  LinkItem: DropdownMenuLinkItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioGroup: DropdownMenuPrimitive.RadioGroup,
  RadioItem: DropdownMenuRadioItem,
  RadioItemIndicator: DropdownMenuRadioItemIndicator,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Group: DropdownMenuPrimitive.Group,
});
