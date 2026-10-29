/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addToRange, Calendar } from "./calendar";
import { formatDay, parseDay, shortDate, showDate, typedDate } from "../forms/core/dates";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

const press = (day: string) =>
  act(async () => host.querySelector<HTMLElement>(`[data-day="${day}"] button`)!.click());

const days = (...dates: (Date | undefined)[]) => dates.map((date) => date && formatDay(date));

test("dates are local days, stored as yyyy-MM-dd and shown with abbreviated month names", () => {
  const day = parseDay("2026-09-27")!;
  expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 8, 27]);
  expect(formatDay(day)).toBe("2026-09-27");
  expect(shortDate(day)).toBe("Sep 27, 2026");
  expect(parseDay("soon")).toBeUndefined();
});

test("a day joins a range as react-day-picker's addToRange adds it", () => {
  const d1 = parseDay("2026-09-01")!;
  const d5 = parseDay("2026-09-05")!;
  const d9 = parseDay("2026-09-09")!;

  const days = (r: ReturnType<typeof addToRange>) =>
    r && [r.from && formatDay(r.from), r.to && formatDay(r.to)];

  expect(days(addToRange(d5, { from: d1 }))).toEqual(["2026-09-01", "2026-09-05"]);
  expect(days(addToRange(d1, { from: d5 }))).toEqual(["2026-09-01", "2026-09-05"]); // before the start: it becomes the start
  expect(days(addToRange(d9, { from: d1, to: d5 }))).toEqual(["2026-09-01", "2026-09-09"]);
  expect(days(addToRange(d5, { from: d1, to: d9 }))).toEqual(["2026-09-01", "2026-09-05"]); // inside: it becomes the end
  expect(days(addToRange(d9, { from: d1, to: d9 }))).toEqual(["2026-09-09", "2026-09-09"]); // on the end: just that day
  expect(addToRange(d5, { from: d5, to: d5 })).toBeUndefined(); // the only day again: no range
});

test("dates show and parse in a date question's Format, or the default abbreviated-month format", () => {
  const day = parseDay("2026-09-07")!;
  expect(showDate(day, "")).toBe("Sep 7, 2026");
  expect(showDate(day, "dd/MM/yyyy")).toBe("07/09/2026");

  const typed = (text: string, format: string) => {
    const d = typedDate(text, format);

    return d && formatDay(d);
  };

  expect(typed("Sep 7, 2026", "")).toBe("2026-09-07");
  expect(typed("07.09.2026", "dd.MM.yyyy")).toBe("2026-09-07");
  expect(typed("9/7/2026", "MM/dd/yyyy")).toBe("2026-09-07");
  expect(typed("2026-09-07", "dd/MM/yyyy")).toBe("2026-09-07"); // yyyy-MM-dd is always understood
  expect(typed("31/02/2026", "dd/MM/yyyy")).toBeUndefined(); // no such day
  expect(typed("Sep 7", "")).toBeUndefined(); // not finished yet
});

test("date formats use date-fns tokens and read back as typed", () => {
  const day = parseDay("2026-09-07")!;

  const formats = {
    "": "Sep 7, 2026", // Full date
    "MM/dd/yyyy": "09/07/2026",
    "dd/MM/yyyy": "07/09/2026",
    "yyyy/MM/dd": "2026/09/07",
    "dd.MM.yyyy": "07.09.2026",
    "yyyy-MM-dd": "2026-09-07",
  };

  for (const [format, shown] of Object.entries(formats)) {
    expect(showDate(day, format)).toBe(shown);
    expect(formatDay(typedDate(shown, format)!)).toBe("2026-09-07");
  }

  expect(typedDate("9/7/202", "MM/dd/yyyy")).toBeUndefined(); // the year still being typed
  expect(formatDay(typedDate("2026/9/7", "yyyy/MM/dd")!)).toBe("2026-09-07");
  // Years under 1000 too (the calendar reaches 0001)
  const early = parseDay("0005-01-05")!;
  expect([formatDay(early), shortDate(early), showDate(early, "dd/MM/yyyy")]).toEqual([
    "0005-01-05",
    "Jan 5, 5",
    "05/01/0005",
  ]);
  expect(parseDay("2026-02-30")).toBeUndefined(); // parseISO's real days only
});

test("a pick reports the next value and the day pressed; pressing the chosen day again clears it", async () => {
  const onValueChange = vi.fn();
  const september = parseDay("2026-09-01")!;

  await render(<Calendar mode="single" defaultMonth={september} onValueChange={onValueChange} />);
  await press("2026-09-07");

  const [value, day] = onValueChange.mock.lastCall!;

  expect(days(value, day)).toEqual(["2026-09-07", "2026-09-07"]);
  await render(
    <Calendar mode="single" value={value} defaultMonth={september} onValueChange={onValueChange} />,
  );
  await press("2026-09-07");

  const [cleared, again] = onValueChange.mock.lastCall!;

  expect(days(cleared, again)).toEqual([undefined, "2026-09-07"]);
});

test("a range grows from its start, and the caller keeps the value", async () => {
  const onValueChange = vi.fn();
  const from = parseDay("2026-09-01")!;

  await render(
    <Calendar mode="range" value={{ from }} defaultMonth={from} onValueChange={onValueChange} />,
  );
  await press("2026-09-05");

  const [range, day] = onValueChange.mock.lastCall!;

  expect(days(range.from, range.to, day)).toEqual(["2026-09-01", "2026-09-05", "2026-09-05"]);
  // Nothing changes until the caller passes the value back
  expect(host.querySelector('[data-day="2026-09-05"]')!.hasAttribute("data-selected")).toBe(false);
});

test("its month buttons are the kit's small buttons, 44px under a coarse pointer", async () => {
  await render(
    <Calendar mode="single" defaultMonth={parseDay("2026-09-01")!} onValueChange={() => {}} />,
  );

  const next = host.querySelector<HTMLElement>('[aria-label="Next month"]')!;

  expect(next.className).toEqual(expect.stringContaining("h-8"));
  expect(next.className).toContain("pointer-coarse:min-h-11");
  await act(async () => next.click());
  expect(host.querySelector('[data-day="2026-10-01"]')).not.toBeNull();
});
