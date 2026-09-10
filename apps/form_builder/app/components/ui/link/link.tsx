import { forwardRef, type SVGProps } from "react";
import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "../utils/cn";
import {
  useLinkComponent,
  type LinkComponentProps,
} from "../utils/link-provider";
const ExternalIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="link-external-icon"
    {...props}
  >
    <path d="M9 4H8.8C7.11984 4 6.27976 4 5.63803 4.32698C5.07354 4.6146 4.6146 5.07354 4.32698 5.63803C4 6.27976 4 7.11984 4 8.8V15.2C4 16.8802 4 17.7202 4.32698 18.362C4.6146 18.9265 5.07354 19.3854 5.63803 19.673C6.27976 20 7.11984 20 8.8 20H15.2C16.8802 20 17.7202 20 18.362 19.673C18.9265 19.3854 19.3854 18.9265 19.673 18.362C20 17.7202 20 16.8802 20 15.2V15" />
    <path d="M14 4H20M20 4V10M20 4L11 13" />
  </svg>
);
ExternalIcon.displayName = "Link.ExternalIcon";
/** Link variant definitions mapping variant names to their Tailwind classes. */
const linkStyles = {
  variant: {
    inline:
      // text-ui-link provides defensive color that won't be overridden by global `a` styles
      "text-ui-link underline underline-offset-[0.15em] decoration-[0.0625em] link-current transition-colors",
    current:
      "text-current underline underline-offset-[0.15em] decoration-[0.0625em] link-current transition-colors",
    plain:
      // text-ui-link provides defensive color that won't be overridden by global `a` styles
      "text-ui-link hover:text-ui-link/70 transition-colors",
  },
} as const;
export type LinkVariant = keyof typeof linkStyles.variant;
export interface LinkVariantsProps {
  variant?: LinkVariant;
}
export function linkVariants({ variant = "inline" }: LinkVariantsProps = {}) {
  return cn(linkStyles.variant[variant] ?? linkStyles.variant["inline"]);
}
export type LinkProps = useRender.ComponentProps<"a"> &
  LinkComponentProps &
  LinkVariantsProps;
const LinkBase = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { className, variant = "inline", render, ...props },
  ref,
) {
  const LinkComponent = useLinkComponent();
  const defaultProps = {
    "data-ui-component": "Link",
    className: cn(
      linkVariants({ variant }),
      "group/link inline-flex items-center gap-[0.1875em]",
    ),
  } as useRender.ElementProps<"a">;
  const element = useRender({
    render: render ?? <LinkComponent />,
    ref,
    props: mergeProps<"a">(defaultProps, props, { className }),
  });
  return element;
});
LinkBase.displayName = "Link";
// Compound component with ExternalIcon subcomponent
export const Link = Object.assign(LinkBase, {
  ExternalIcon,
});
