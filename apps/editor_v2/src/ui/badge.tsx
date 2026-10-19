import type { ComponentProps } from "react";
import { cn } from "../cn";

// Each GovBB tint, with the shade of the same colour that reads on it at 6:1 or better. Tag takes the same tones
export const tones = {
  neutral: "bg-grey-20 text-grey-80",
  info: "bg-blue-10 text-blue-80",
  success: "bg-green-10 text-green-80",
  warning: "bg-yellow-20 text-ink",
  error: "bg-red-10 text-red-80",
};

export type BadgeTone = keyof typeof tones;

/** A short label for a status or a property. Its words carry the meaning; the tone backs them up. */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-sm px-2 py-0.5 text-12 font-semibold whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
