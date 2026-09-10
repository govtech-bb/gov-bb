import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../button";
import { cn } from "../utils/cn";
/** Empty state size variant definitions mapping sizes to their Tailwind classes. */
const emptyStyles = {
  size: {
    sm: "px-6 py-8 gap-4",
    base: "px-10 py-16 gap-6",
    lg: "px-12 py-20 gap-8",
  },
} as const;
export type EmptySize = keyof typeof emptyStyles.size;
export interface EmptyVariantsProps {
  size?: EmptySize;
}
export function emptyVariants({ size = "base" }: EmptyVariantsProps = {}) {
  return cn(
    "flex w-full flex-col items-center rounded-xl border border-ui-tint bg-ui-control text-ui-default",
    emptyStyles.size[size] ?? emptyStyles.size["base"],
  );
}
export interface EmptyProps extends EmptyVariantsProps {
  /** Decorative icon displayed above the title (e.g. from `@phosphor-icons/react`). */
  icon?: React.ReactNode;
  /** Primary heading text for the empty state. */
  title: string;
  /** Secondary description text displayed below the title. */
  description?: string;
  /** Shell command displayed in a copyable code block. */
  commandLine?: string;
  /** Additional content (buttons, links) rendered below the description. */
  contents?: React.ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
}
export function Empty({
  icon,
  title,
  description,
  commandLine,
  contents,
  size = "base",
  className,
}: EmptyProps) {
  const [emptyStateCopied, setEmptyStateCopied] = useState<boolean>(false);
  return (
    <div className={cn(emptyVariants({ size }), className)}>
      {icon}
      <h2 className="text-2xl font-semibold">{title}</h2>

      {description && (
        <p className="max-w-140 text-center text-ui-subtle">{description}</p>
      )}

      {commandLine && (
        <div
          className={cn(
            "group/cmd relative inline-flex h-10 max-w-8/10 transform-gpu items-center gap-2 rounded-lg font-mono shadow-sm",
            "bg-ui-tint pr-2 pl-3",
            "transition-all duration-300 hover:border-ui-line/80 hover:shadow-md",
            "border border-ui-tint/60",
          )}
        >
          <span className="text-xs text-ui-inactive select-none">$</span>
          <span className="no-scrollbar overflow-scroll text-base whitespace-nowrap text-ui-brand">
            {commandLine}
          </span>
          <Button
            className="group"
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Copy command"
            onClick={async () => {
              setEmptyStateCopied(true);
              setTimeout(() => {
                setEmptyStateCopied(false);
              }, 1000);
              await navigator.clipboard.writeText(commandLine);
            }}
          >
            {emptyStateCopied ? (
              <CheckIcon
                size={16}
                className="animate-bounce-in text-ui-success"
              />
            ) : (
              <CopyIcon
                size={16}
                className="text-ui-inactive group-hover:text-ui-brand"
              />
            )}
          </Button>
        </div>
      )}

      {contents}
    </div>
  );
}
