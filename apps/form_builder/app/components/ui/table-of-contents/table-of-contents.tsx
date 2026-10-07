import { cloneElement, forwardRef, isValidElement } from "react";
import { cn } from "../utils/cn";
import { ListHighlight, AnimatedText } from "../animation";
/** TableOfContents item state variant definitions. */
const tableOfContentsStyles = {
  state: {
    default:
      "text-ui-subtle hover:border-ui-hairline hover:text-ui-default hover:font-medium",
    active: "border-ui-brand font-medium text-ui-default",
  },
} as const;
export type TableOfContentsState = keyof typeof tableOfContentsStyles.state;
const ITEM_BASE =
  "block w-full truncate border-l-2 border-transparent py-0.5 pl-4 text-sm text-left no-underline";
export type TableOfContentsProps = React.HTMLAttributes<HTMLElement>;
const TableOfContentsRoot = forwardRef<HTMLElement, TableOfContentsProps>(
  (
    { className, "aria-label": ariaLabel = "Table of contents", ...props },
    ref,
  ) => (
    <nav ref={ref} aria-label={ariaLabel} className={className} {...props} />
  ),
);
export type TableOfContentsTitleProps =
  React.HTMLAttributes<HTMLParagraphElement>;
const TableOfContentsTitle = forwardRef<
  HTMLParagraphElement,
  TableOfContentsTitleProps
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "mb-3 text-xs font-semibold tracking-wide text-ui-subtle uppercase",
      className,
    )}
    {...props}
  />
));
export type TableOfContentsListProps = React.HTMLAttributes<HTMLUListElement>;
const TableOfContentsList = forwardRef<
  HTMLUListElement,
  TableOfContentsListProps
>(({ className, ...props }, ref) => (
  <ListHighlight
    render={<ul />}
    decorationTag="li"
    itemSelector="[data-ui-component=TableOfContents]"
    selection="single"
    ref={ref}
    className={cn(
      "ui-toc flex flex-col gap-2 border-l-2 border-ui-hairline",
      className,
    )}
    {...props}
  />
));
export interface TableOfContentsItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Whether this item represents the currently active section. */
  active?: boolean;
  render?: React.ReactElement;
}
const TableOfContentsItem = forwardRef<
  HTMLAnchorElement,
  TableOfContentsItemProps
>(({ active = false, className, children, render, ...props }, ref) => {
  const stateClasses = active
    ? tableOfContentsStyles.state.active
    : tableOfContentsStyles.state.default;
  const combinedClassName = cn(ITEM_BASE, stateClasses, className);
  const innerContent = (
    <span className="block min-w-0 leading-5">
      <AnimatedText active={active}>{children}</AnimatedText>
    </span>
  );
  const sharedProps = {
    ref,
    "aria-current": active ? ("true" as const) : undefined,
    "data-ui-component": "TableOfContents",
    "data-ui-part": "item",
    "data-active": active ? "true" : undefined,
    className: combinedClassName,
    children: innerContent,
    ...props,
  };
  // If a render prop is provided, clone it with our props
  if (render && isValidElement(render)) {
    return <li className="-ml-0.5">{cloneElement(render, sharedProps)}</li>;
  }
  // Default to anchor tag
  return (
    <li className="-ml-0.5">
      {/* oxlint-disable-next-line anchor-has-content -- children are in sharedProps */}
      <a {...sharedProps} />
    </li>
  );
});
export interface TableOfContentsGroupProps extends Omit<
  React.HTMLAttributes<HTMLLIElement>,
  "title"
> {
  /** Label displayed above the group's items. */
  label: string;
  /** URL the group label links to. When provided, the label renders as a clickable link with item styling. */
  href?: string;
  /** Whether this group's label represents the currently active section. Only applies when `href` is provided. */
  active?: boolean;
}
const NESTED_UL_CLASSES =
  "flex flex-col gap-2 border-l-2 border-ui-hairline [&>li>a]:pl-7 [&>li>button]:pl-7";
const TableOfContentsGroup = forwardRef<
  HTMLLIElement,
  TableOfContentsGroupProps
>(
  (
    { label, href, active = false, className, children, onClick, ...props },
    ref,
  ) => {
    if (href) {
      const stateClasses = active
        ? tableOfContentsStyles.state.active
        : tableOfContentsStyles.state.default;
      return (
        <li
          ref={ref}
          className={cn("-ml-0.5 flex flex-col gap-2", className)}
          {...props}
        >
          {/* onClick goes on the label link, not the <li>: the <li> also wraps
                the nested items, so a handler there would fire for child clicks
                too and override the child's own selection. */}
          <a
            href={href}
            onClick={onClick as React.MouseEventHandler | undefined}
            aria-current={active ? ("true" as const) : undefined}
            data-ui-component="TableOfContents"
            data-ui-part="group-link"
            data-active={active ? "true" : undefined}
            className={cn(ITEM_BASE, stateClasses)}
          >
            <span className="block min-w-0 leading-5">
              <AnimatedText active={active}>{label}</AnimatedText>
            </span>
          </a>
          <ul className={cn(NESTED_UL_CLASSES)}>{children}</ul>
        </li>
      );
    }
    // Without an href the label is a non-interactive title, so `onClick` is
    // intentionally not rendered — putting it on the <li> would also catch
    // clicks bubbling up from the nested items.
    return (
      <li
        ref={ref}
        className={cn("-ml-0.5 flex flex-col gap-2", className)}
        {...props}
      >
        <p className="py-0.5 pl-4 text-sm leading-5 font-medium text-ui-subtle">
          {label}
        </p>
        <ul className={cn(NESTED_UL_CLASSES)}>{children}</ul>
      </li>
    );
  },
);
TableOfContentsRoot.displayName = "TableOfContents";
TableOfContentsTitle.displayName = "TableOfContents.Title";
TableOfContentsList.displayName = "TableOfContents.List";
TableOfContentsItem.displayName = "TableOfContents.Item";
TableOfContentsGroup.displayName = "TableOfContents.Group";
export const TableOfContents = Object.assign(TableOfContentsRoot, {
  Title: TableOfContentsTitle,
  List: TableOfContentsList,
  Item: TableOfContentsItem,
  Group: TableOfContentsGroup,
});
