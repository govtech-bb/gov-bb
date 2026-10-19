import { mergeProps } from "@base-ui/react/merge-props";
import { Toolbar } from "@base-ui/react/toolbar";
import { useRender } from "@base-ui/react/use-render";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "./button";
import { Tip } from "./tooltip";
import { useMediaQuery, wideScreen } from "./use-media-query";

// White over a document, ruled off from it; GovBB's navy for the app's own header. Each with its quiet text and rule
const tones = {
  light: { bar: "border-b border-line bg-white text-ink", status: "text-muted", rule: "bg-line" },
  dark: { bar: "bg-brand-dark text-white", status: "text-blue-20", rule: "bg-white/25" },
};

type Tone = keyof typeof tones;

const BarContext = createContext<{ tone: Tone; toolbar: boolean }>({
  tone: "light",
  toolbar: false,
});

type RootProps = Omit<ComponentProps<"div">, "aria-label"> & {
  tone?: Tone;
  /** Names its controls for screen readers, which makes it a toolbar, such as “Page tools”. */
  label?: string;
};

/**
 * A bar across a screen, a document or a drawer: its title, a status beside it and its actions at the end. Every bar
 * is 56px (`--bar-height`) and inset like the others, so their edges line up; narrow, its actions wrap under the
 * title. With a label it's a Base UI toolbar.
 */
function BarRoot({ tone = "light", label, className, ...props }: RootProps) {
  const classes = cn(
    "flex min-h-(--bar-height) flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-14 sm:px-6",
    tones[tone].bar,
    className,
  );

  return (
    <BarContext value={{ tone, toolbar: label !== undefined }}>
      {label === undefined ? (
        <div {...props} className={classes} />
      ) : (
        <Toolbar.Root {...props} aria-label={label} className={classes} />
      )}
    </BarContext>
  );
}

/** What the bar is about, cut short when there's no room. `render` makes it a heading, such as a document's h1. */
function BarTitle({ render, ...props }: useRender.ComponentProps<"span">) {
  return useRender({
    render,
    defaultTagName: "span",
    props: mergeProps<"span">({ className: "min-w-0 truncate text-16 font-semibold" }, props),
  });
}

/** Where things stand, such as whether the document is saved: quiet beside the title, which gives way to it. */
function BarStatus({ className, ...props }: ComponentProps<"div">) {
  const { tone } = useContext(BarContext);

  return (
    <div
      {...props}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap",
        tones[tone].status,
        className,
      )}
    />
  );
}

/** The bar's controls, at its end: the title gives way to them. */
function BarActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("ms-auto flex shrink-0 flex-wrap items-center gap-1", className)}
    />
  );
}

type ToolProps = Omit<ComponentProps<"button">, "children"> & {
  icon: ReactNode;
  /** Its name: shown beside the icon on a wide screen, and as a tooltip on a narrower one. */
  label: string;
  /** More of its name for screen readers, such as that its document has changes waiting. */
  children?: ReactNode;
};

/**
 * One of the bar's tools, such as Preview or Markdown. Narrower than 1200px it's only its icon, its name in a tooltip
 * and still read out, so a document's bar keeps to one row beside a sidebar or on a tablet.
 */
function BarTool({ icon, label, children, className, ...props }: ToolProps) {
  const wide = useMediaQuery(wideScreen);

  const tool = (
    <Button
      {...props}
      icon={icon}
      className={cn("max-xl:aspect-square max-xl:gap-0 max-xl:px-0", className)}
    >
      <span className="max-xl:sr-only">{label}</span>
      {children}
    </Button>
  );

  return wide ? tool : <Tip content={label}>{tool}</Tip>;
}

/**
 * Rules off one group of actions from the next: a separator in a toolbar, and only a line otherwise. Narrow, where
 * the actions wrap, it gives way to the gaps.
 */
function BarSeparator() {
  const { tone, toolbar } = useContext(BarContext);
  const rule = cn("mx-2 h-5 w-px shrink-0 max-md:hidden", tones[tone].rule);

  return toolbar ? (
    <Toolbar.Separator className={rule} />
  ) : (
    <span aria-hidden="true" className={rule} />
  );
}

/** The tool's bars: Root holds a Title, a Status and Actions, ruled into groups by Separators, some of them Tools. */
export const Bar = {
  Root: BarRoot,
  Title: BarTitle,
  Status: BarStatus,
  Actions: BarActions,
  Tool: BarTool,
  Separator: BarSeparator,
};
