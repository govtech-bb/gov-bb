import { cn } from "../cn";

// Live is a filled green, waiting a filled amber, off an empty grey ring: the ring keeps "not live" apart from the
// others without its colour.
const tones = {
  success: "bg-green-80",
  warning: "bg-yellow-80",
  neutral: "border-[1.5px] border-grey-60",
};

export type StatusTone = keyof typeof tones;

/**
 * A small dot for a status, such as how far a page is published. With a `label` it stands in for the words: it is
 * announced, and named on hover. Without one, the words beside it carry the meaning.
 */
export function StatusDot({ tone, label }: { tone: StatusTone; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn("inline-block size-2 shrink-0 rounded-full", tones[tone])}
    />
  );
}
