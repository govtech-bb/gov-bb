import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Loader } from "./loader";

const markup = renderToStaticMarkup(<Loader label="Loading page" />);

/** Each dot's path starts at the dot's top, so that point stands in for the dot. */
const points = (path: string) =>
  Array.from(path.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g), ([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }));

const restingDots = points(/fill-opacity="0.32"[^>]*><path d="([^"]*)"/.exec(markup)?.[1] ?? "");

const bands = Array.from(
  markup.matchAll(/animation-delay:calc\(([\d.]+) \*[^"]*"[^>]*><path d="([^"]*)"/g),
  ([, delay, path]) => ({ delay: Number(delay), dots: points(path ?? "") }),
);

test("announces its label as a status", () => {
  expect(markup).toMatch(/^<span role="status"/);
  expect(markup).toContain(">Loading page</span>");
});

test("draws the trident in hundreds of dots, mirrored about its axis", () => {
  expect(restingDots.length).toBeGreaterThan(300);

  const span =
    Math.min(...restingDots.map((dot) => dot.x)) + Math.max(...restingDots.map((dot) => dot.x));

  const unmatched = restingDots.filter(
    (dot) =>
      !restingDots.some((other) => other.y === dot.y && Math.abs(other.x - (span - dot.x)) < 0.002),
  );

  expect(unmatched).toEqual([]);
});

test("lights every dot once a cycle, from the broken shaft up to the three points", () => {
  expect(bands).toHaveLength(20);
  expect(bands.reduce((total, band) => total + band.dots.length, 0)).toBe(restingDots.length);

  const bottom = Math.max(...bands.flatMap((band) => band.dots.map((dot) => dot.y)));
  const first = bands.find((band) => band.delay === 0);

  expect(first?.dots.some((dot) => dot.y === bottom)).toBe(true);

  for (const band of bands.filter(({ delay }) => delay >= 0.9))
    for (const dot of band.dots) expect(dot.y).toBeLessThan(31 / 3);
});
