import { expect, test } from "vitest";
import { cn } from "./cn";

test("numeric font sizes survive colors and line-heights", () => {
  expect(cn("leading-none text-14 text-muted")).toBe("leading-none text-14 text-muted");
  expect(cn("text-13", "text-15")).toBe("text-15");
});

test("theme shadows and overrides merge", () => {
  expect(cn("shadow-input", "hover:shadow-input-hover", "shadow-press")).toBe(
    "hover:shadow-input-hover shadow-press",
  );
  expect(cn("h-7 rounded-md px-[0.7em]", "w-7 rounded-full px-0")).toBe(
    "h-7 w-7 rounded-full px-0",
  );
});
