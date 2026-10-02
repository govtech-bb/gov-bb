import {
  createContext,
  forwardRef,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "../utils/cn";

const SurfaceContext = createContext(1);
const backgrounds = [
  "bg-ui-surface-1",
  "bg-ui-surface-2",
  "bg-ui-surface-3",
  "bg-ui-surface-4",
  "bg-ui-surface-5",
  "bg-ui-surface-6",
  "bg-ui-surface-7",
  "bg-ui-surface-8",
];
const shadows = [
  "shadow-ui-surface-1",
  "shadow-ui-surface-2",
  "shadow-ui-surface-3",
  "shadow-ui-surface-4",
  "shadow-ui-surface-5",
  "shadow-ui-surface-6",
  "shadow-ui-surface-7",
  "shadow-ui-surface-8",
];

function surfaceLevel(value: number) {
  return Number.isNaN(value) ? 1 : Math.max(1, Math.min(8, Math.round(value)));
}

export function surfaceClasses(bgLevel: number, shadowLevel = bgLevel) {
  return `${backgrounds[surfaceLevel(bgLevel) - 1]} ${shadows[surfaceLevel(shadowLevel) - 1]}`;
}

export function useSurface() {
  return useContext(SurfaceContext);
}

export function SurfaceProvider({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return (
    <SurfaceContext.Provider value={surfaceLevel(value)}>
      {children}
    </SurfaceContext.Provider>
  );
}

export type ElevatedProps = useRender.ComponentProps<"div"> & {
  /** Steps above the surrounding surface: 2 for menus, 4 for dialogs. */
  offset: number;
  /** Keep a fixed shadow weight while the background follows its substrate. */
  shadowLevel?: number;
};

export const Elevated = forwardRef<HTMLDivElement, ElevatedProps>(
  function Elevated(
    { offset, shadowLevel, className, render, style, ...props },
    ref,
  ) {
    const level = surfaceLevel(useSurface() + offset);
    const defaults = {
      "data-ui-surface": level,
      className: cn(
        "ui-elevated text-ui-default",
        surfaceClasses(level, shadowLevel ?? level),
        className,
      ),
      style: {
        "--ui-elevation-bg": `var(--ui-surface-${level})`,
        ...style,
      } as CSSProperties,
    };
    const element = useRender({
      defaultTagName: "div",
      render,
      ref,
      props: mergeProps<"div">(defaults, props),
    });
    return <SurfaceProvider value={level}>{element}</SurfaceProvider>;
  },
);
