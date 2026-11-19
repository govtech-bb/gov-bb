import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "../cn";
import { Loader } from "./loader";

const sizes = {
  // A screen's whole content: the editor starting, or a service or a page opening. Centred in the height under the
  // workspace's bar, where the page editor will stand, so the window and the workspace show it alike
  page: { frame: "grid min-h-[calc(100dvh-var(--bar-height))] place-items-center", loader: 96 },
  // A dialog's or a panel's body
  section: { frame: "grid place-items-center py-8", loader: 48 },
};

/**
 * The trident Loader, centred where the content will be, at the size of what it stands in for, as EmptyState's sizes
 * are. The visible label says what is loading, such as “Loading page…”, and is announced once. A line in a list or a
 * panel (`inline`) has no room for the trident: there the turning circle a pending Button shows leads its words.
 */
export function LoadingState({
  label,
  size = "section",
  className,
}: {
  label: string;
  size?: keyof typeof sizes | "inline";
  className?: string;
}) {
  if (size === "inline")
    return (
      <p role="status" className={cn("flex gap-2 text-14 text-muted", className)}>
        <CircleNotch
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
        />
        {label}
      </p>
    );

  return (
    <div className={cn(sizes[size].frame, className)}>
      <div
        role="status"
        className="flex flex-col items-center gap-3 px-4 text-center text-14 text-muted"
      >
        <Loader size={sizes[size].loader} label={null} />
        <span>{label}</span>
      </div>
    </div>
  );
}
