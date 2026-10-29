import { CheckCircle, Info, Warning, WarningCircle } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

/** Each tone's icon, in its own colour, so a message's tone isn't told by colour alone. Toasts carry them too. */
export const toneIcons = {
  info: <Info className="text-blue-80" />,
  success: <CheckCircle className="text-green-80" />,
  warning: <Warning />,
  error: <WarningCircle className="text-error" />,
};

// A GovBB tint behind ink text
const tones = {
  info: "bg-blue-10",
  success: "bg-green-10",
  warning: "bg-yellow-20",
  error: "bg-red-10",
};

const layouts = {
  // Edge to edge across a pane, under its toolbar, with its buttons beside the message
  strip: "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3",
  // Inside a dialog, a panel or a page, with its buttons under the message
  box: "rounded-sm px-3.5 py-3",
};

// A strip's sides: in line with the bars over it, or with the rows of the card it's in
const insets = {
  bar: "px-4 sm:px-6",
  card: "px-4",
};

export type BannerTone = keyof typeof tones;

type BannerProps = Omit<ComponentProps<"div">, "title"> & {
  tone: BannerTone;
  layout?: keyof typeof layouts;
  /** A strip's sides: the bars' (`bar`), or a card's (`card`) for one inside a card, such as over a list's rows. */
  inset?: keyof typeof insets;
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
  inset = "bar",
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
      className={cn(
        "text-14 leading-5 text-ink",
        tones[tone],
        layouts[layout],
        strip && insets[inset],
        className,
      )}
    >
      {/* At least 15rem, so in a narrow strip its buttons wrap below the message rather than squeezing it */}
      <div className="flex min-w-0 grow basis-60 gap-2.5">
        <span aria-hidden="true" className="mt-0.5 flex shrink-0 [&>svg]:size-4">
          {toneIcons[tone]}
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
