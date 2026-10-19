import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ArrowUpRight } from "@phosphor-icons/react";
import { cn } from "../cn";

/** GovBB's link: teal and underlined, then ink on a teal tint under the pointer. Button's link variant looks the same. */
export const link =
  "text-interactive underline decoration-[max(1px,0.0625em)] underline-offset-[0.1em] hover:bg-interactive-subtle hover:text-ink hover:no-underline";

type TextLinkProps = useRender.ComponentProps<"a"> & {
  /** Another site, opened in a new tab: an arrow shows it, and “(opens in a new tab)” tells screen readers. */
  external?: boolean;
};

/**
 * A link in a sentence or a list. For a screen in the editor, render the router's Link, so the
 * router follows it: `<TextLink render={<Link to="/services" />}>`. For another site, give an `href` and `external`.
 */
export function TextLink({
  render,
  external = false,
  className,
  children,
  ...props
}: TextLinkProps) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        className: cn(link, className),
        target: external ? "_blank" : undefined,
        rel: external ? "noreferrer" : undefined,
        children: external ? (
          <>
            {children}
            <ArrowUpRight aria-hidden="true" className="ms-0.5 inline align-[-0.125em]" />
            <span className="sr-only"> (opens in a new tab)</span>
          </>
        ) : (
          children
        ),
      },
      props,
    ),
  });
}
