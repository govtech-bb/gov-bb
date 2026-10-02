import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "../utils/cn";
const LAYER_CARD_SURFACE_CLASSES =
  "overflow-hidden rounded-lg bg-ui-base shadow-xs ring ring-ui-hairline";
const LAYER_CARD_LAYERED_ROOT_CLASSES =
  "flex w-full flex-col overflow-hidden rounded-lg bg-ui-elevated text-base ring ring-ui-hairline";
const LAYER_CARD_SECONDARY_CLASSES =
  "-my-2 flex items-center gap-2 bg-ui-elevated p-4 text-base font-medium text-ui-subtle";
const LAYER_CARD_PRIMARY_CLASSES =
  "relative flex flex-col gap-2 overflow-hidden rounded-lg bg-ui-base p-4 pr-3 text-inherit no-underline ring ring-ui-tint";

export function layerCardVariants() {
  return cn(LAYER_CARD_SURFACE_CLASSES);
}
function hasLayerCardSections(children: ReactNode): boolean {
  return Children.toArray(children).some((child): boolean => {
    if (!isValidElement(child)) {
      return false;
    }
    if (child.type === LayerCardPrimary || child.type === LayerCardSecondary) {
      return true;
    }
    if (child.type === Fragment) {
      const fragmentChild = child as ReactElement<{
        children?: ReactNode;
      }>;
      return hasLayerCardSections(fragmentChild.props.children);
    }
    return false;
  });
}
export type LayerCardProps = useRender.ComponentProps<"div">;
export type LayerCardSectionProps = ComponentPropsWithoutRef<"div">;
const LayerCardRoot = forwardRef<HTMLDivElement, LayerCardProps>(
  function LayerCard({ children, className, render, ...props }, ref) {
    const hasStructuredLayers = hasLayerCardSections(children);
    const defaultProps: useRender.ElementProps<"div"> = {
      className: cn(
        hasStructuredLayers
          ? LAYER_CARD_LAYERED_ROOT_CLASSES
          : layerCardVariants(),
        className,
      ),
    };
    return useRender({
      defaultTagName: "div",
      render,
      ref,
      props: mergeProps<"div">(defaultProps, props, { children }),
    });
  },
);
function LayerCardSecondary({
  children,
  className,
  ...props
}: LayerCardSectionProps) {
  return (
    <div className={cn(LAYER_CARD_SECONDARY_CLASSES, className)} {...props}>
      {children}
    </div>
  );
}
function LayerCardPrimary({
  children,
  className,
  ...props
}: LayerCardSectionProps) {
  return (
    <div className={cn(LAYER_CARD_PRIMARY_CLASSES, className)} {...props}>
      {children}
    </div>
  );
}
LayerCardRoot.displayName = "LayerCard";
LayerCardSecondary.displayName = "LayerCard.Secondary";
LayerCardPrimary.displayName = "LayerCard.Primary";
type LayerCardComponent = typeof LayerCardRoot & {
  Primary: typeof LayerCardPrimary;
  Secondary: typeof LayerCardSecondary;
};
const LayerCard = Object.assign(LayerCardRoot, {
  Primary: LayerCardPrimary,
  Secondary: LayerCardSecondary,
}) as LayerCardComponent;
export { LayerCard };
