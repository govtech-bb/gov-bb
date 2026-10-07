import { useCellContext } from "./hook";

const dates = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export function TextCell() {
  const value = useCellContext<string | null>().getValue();

  return value ? value : <span className="text-muted">None</span>;
}

/** An ISO timestamp as its UTC calendar day, e.g. 6 Oct 2026. */
export function DateCell() {
  const value = useCellContext<string>().getValue();

  return (
    <time dateTime={value} className="whitespace-nowrap text-muted tabular-nums">
      {dates.format(new Date(value))}
    </time>
  );
}
