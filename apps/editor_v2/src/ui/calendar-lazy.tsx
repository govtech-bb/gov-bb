import { lazy, Suspense } from "react";
import type { CalendarProps } from "./calendar";

export type { CalendarProps, DateRange } from "./calendar";

// react-day-picker takes 0.5-1s to import, and most of the editor reaches a date field. Loading it
// with the calendar's first render keeps that cost off every page and test file that never opens
// one (#3764).
const Loaded = lazy(async () => ({ default: (await import("./calendar")).Calendar }));

export function Calendar(props: CalendarProps) {
  return (
    <Suspense>
      <Loaded {...props} />
    </Suspense>
  );
}
