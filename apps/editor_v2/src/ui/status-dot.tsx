import { cn } from "../cn";

// Live is a filled green, waiting an amber fill in a grey ring, off the empty ring: the ring sets "not live" apart from
// live, and the fill sets waiting apart from off, without their colours. Amber alone is 2:1 on white and less on a
// selected row; the ring (grey-60) is at least 3:1 on white, the selected and hovered rows, and a menu's navy row.
const tones = {
  success: "bg-green-80",
  warning: "border-[1.5px] border-grey-60 bg-yellow-80",
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
