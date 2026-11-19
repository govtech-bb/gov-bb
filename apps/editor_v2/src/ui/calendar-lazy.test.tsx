/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Calendar } from "./calendar-lazy";
import { formatDay, parseDay } from "../forms/model/dates";

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

test("the calendar loads on its first render and passes a day press through", async () => {
  const onValueChange = vi.fn();
  const day = () => host.querySelector<HTMLElement>('[data-day="2026-09-07"] button');

  await act(async () => {
    root.render(
      <Calendar
        mode="single"
        defaultMonth={parseDay("2026-09-01")}
        onValueChange={onValueChange}
      />,
    );
    await import("./calendar");
  });

  await vi.waitFor(() => expect(day()).not.toBeNull());
  await act(async () => day()!.click());

  expect(onValueChange).toHaveBeenCalledOnce();
  expect(formatDay(onValueChange.mock.calls[0]![1])).toBe("2026-09-07");
});
