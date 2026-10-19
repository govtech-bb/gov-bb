import { CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

// A GovBB tint behind ink text, and an icon in the tone's own colour so the tone isn't told by colour alone
const tones = {
  info: { frame: "bg-blue-10", icon: <Info className="text-blue-80" /> },
  success: { frame: "bg-green-10", icon: <CheckCircle className="text-green-80" /> },
  warning: { frame: "bg-yellow-20", icon: <Warning /> },
  error: { frame: "bg-red-10", icon: <WarningCircle className="text-error" /> },
};

const layouts = {
  // Edge to edge across a pane, under its toolbar, with its buttons beside the message
  strip: "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-6",
  // Inside a dialog, a panel or a page, with its buttons under the message
  box: "rounded-sm px-3.5 py-3",
};

export type BannerTone = keyof typeof tones;

type BannerProps = Omit<ComponentProps<"div">, "title"> & {
  tone: BannerTone;
  layout?: keyof typeof layouts;
  title?: ReactNode;
  /** What the author can do about it. */
  actions?: ReactNode;
};

/**
 * A message to the author: what happened, and what to do about it. An error is an alert, read out at once; any other
 * tone is a status, read out when the reader is free. Pass `role` to choose otherwise.
 *
 * Where a message goes, so each kind is always found in the same place and none pile up anywhere else:
 * - A problem with the app, such as a session that couldn't be checked: a strip under the app's header.
 * - A problem with the document, such as editing that's paused or a newer version saved elsewhere: a strip in its
 *   document bar's notices (DocumentBar's `notices`; a failed save comes from its `save`, SaveState).
 * - What came of acting in a dialog, done or failed: a box in the dialog's body, in the tone of the outcome.
 * - A problem with one field: on the field, as its error (Field's `error`).
 * - A result told once its control has gone, such as a dialog that closed or a page that was left: a toast.
 */
export function Banner({
  tone,
  layout = "box",
  title,
  actions,
  className,
  children,
  ...props
}: BannerProps) {
  const strip = layout === "strip";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      {...props}
      className={cn("text-14 leading-5 text-ink", tones[tone].frame, layouts[layout], className)}
    >
      {/* At least 15rem, so in a narrow strip its buttons wrap below the message rather than squeezing it */}
      <div className="flex min-w-0 grow basis-60 gap-2.5">
        <span aria-hidden="true" className="mt-0.5 flex shrink-0 [&>svg]:size-4">
          {tones[tone].icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children}
          {actions && !strip && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      {actions && strip && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
