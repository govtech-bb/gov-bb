import { cn } from "../cn";
import "./loader.css";

type Point = readonly [x: number, y: number];

type Curve = readonly [x1: number, y1: number, x2: number, y2: number, x: number, y: number];

type Cell = { x: number; y: number; row: number; col: number; steps: number };

/** The axis of the flag's trident; the artwork's right half mirrors its left about this line. */
const AXIS = 13.722;

const WIDTH = AXIS * 2;

const HEIGHT = 31.008;

/**
 * The left half of the broken trident from the Barbados flag, in the flag artwork's units: lines and
 * cubic curves round from the spear tip at (AXIS, 0) and back to it.
 */
const HALF_TRIDENT: readonly (Point | Curve)[] = [
  [12.682, 2.836, 11.622, 5.788, 9.354, 8.048],
  [10.058, 7.816, 11.29, 7.608, 12.082, 7.628],
  [12.082, 19.556],
  [8.714, 20.056],
  [8.594, 20.044, 8.554, 19.856, 8.554, 19.6],
  [8.23, 15.896, 7.354, 12.784, 6.346, 9.564],
  [6.274, 9.124, 4.998, 7.444, 5.982, 7.74],
  [6.102, 7.756, 7.418, 8.292, 7.21, 8.036],
  [5.418, 6.18, 2.798, 4.844, 0.254, 4.448],
  [0.03, 4.392, -0.102, 4.504, 0.098, 4.764],
  [3.474, 9.96, 6.298, 16.092, 6.274, 23.368],
  [7.586, 23.368, 10.766, 22.592, 12.082, 22.592],
  [12.082, 31.008],
  [13.742, 31.008],
  [14.122, 7.504],
  [AXIS, 0],
];

/** Dot spacing in flag units: about 390 dots, enough to keep the barbs and the curve of the prongs. */
const PITCH = 0.85;

const ROW_STEP = (PITCH * Math.sqrt(3)) / 2;

const DOT_RADIUS = PITCH * 0.4;

/** Resting dots are smaller, so a lit dot seems to swell as its band fades in over it. */
const REST_RADIUS = DOT_RADIUS * 0.72;

/** Spread of each dot's start, as a share of the cycle, so the wave's edge shimmers. */
const JITTER = 0.06;

/** Steps in the wave: the dots it reaches at about the same moment share one layer. */
const BANDS = 20;

const VIEW_BOX = `0 0 ${WIDTH} ${HEIGHT}`;

/** Hex neighbours, as [row, col] steps with `col` counted in half pitches. */
const NEIGHBOURS = [
  [0, -2],
  [0, 2],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The half outline as a closed ring of points, each curve flattened to 12 segments. */
function halfOutline() {
  const ring: Point[] = [[AXIS, 0]];
  let from: Point = [AXIS, 0];

  for (const segment of HALF_TRIDENT) {
    if (segment.length === 2) {
      ring.push(segment);
      from = segment;
      continue;
    }

    const [x1, y1, x2, y2, x, y] = segment;
    const [x0, y0] = from;

    for (let step = 1; step <= 12; step++) {
      const t = step / 12;
      const s = 1 - t;
      ring.push([
        s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x,
        s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y,
      ]);
    }

    from = [x, y];
  }

  return ring;
}

/** Even-odd test against a closed ring. */
function contains(ring: readonly Point[], x: number, y: number) {
  let inside = false;
  let previous: Point | undefined;

  for (const point of ring) {
    if (previous) {
      const [ax, ay] = previous;
      const [bx, by] = point;

      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }

    previous = point;
  }

  return inside;
}

/**
 * A dot on a hex grid wherever its centre falls inside the trident. Each dot's phase is its distance
 * along the trident from the broken end of the shaft, so the wave climbs the shaft, runs out along
 * the crossbar and reaches all three points together.
 */
function tridentDots() {
  const outline = halfOutline();
  const rows = Math.floor(HEIGHT / ROW_STEP) + 1;
  const top = (HEIGHT - (rows - 1) * ROW_STEP) / 2;
  const reach = Math.ceil(WIDTH / PITCH);
  const cells: Cell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = -reach; col <= reach; col++) {
      // Odd rows sit half a pitch over, so their columns are the odd half-pitch steps.
      if (Math.abs(col + row) % 2 === 1) continue;

      const x = AXIS + (col * PITCH) / 2;
      const y = top + row * ROW_STEP;

      if (contains(outline, x, y) || contains(outline, WIDTH - x, y))
        cells.push({ x, y, row, col, steps: Infinity });
    }
  }

  const byPosition = new Map(cells.map((cell) => [`${cell.row},${cell.col}`, cell]));
  const bottom = Math.max(...cells.map((cell) => cell.row));
  const queue = cells.filter((cell) => cell.row === bottom);

  for (const cell of queue) cell.steps = 0;

  for (const cell of queue) {
    for (const [dr, dc] of NEIGHBOURS) {
      const next = byPosition.get(`${cell.row + dr},${cell.col + dc}`);

      if (next && next.steps === Infinity) {
        next.steps = cell.steps + 1;
        queue.push(next);
      }
    }
  }

  const farthest = Math.max(...queue.map((cell) => cell.steps));

  // Golden-ratio steps give every dot a different jitter without any two neighbours matching.
  return queue.map((cell, i) => ({
    x: round(cell.x),
    y: round(cell.y),
    phase: round(cell.steps / farthest + JITTER * (((i * 0.618034) % 1) - 0.5)),
  }));
}

/** Dots as one path, so a layer is a single node however many dots it holds. */
function dotsPath(dots: readonly { x: number; y: number }[], r: number) {
  const radius = round(r);

  return dots
    .map(
      ({ x, y }) =>
        `M${x} ${round(y - radius)}a${radius} ${radius} 0 1 0 0 ${round(2 * radius)}a${radius} ${radius} 0 1 0 0 ${round(-2 * radius)}`,
    )
    .join("");
}

const DOTS = tridentDots();

const REST_PATH = dotsPath(DOTS, REST_RADIUS);

/** The wave's layers in the order it reaches them: the broken shaft first, the three points last. */
const WAVE = Array.from({ length: BANDS }, (_, band) => ({
  delay: band / BANDS,
  path: dotsPath(
    DOTS.filter((dot) => Math.min(BANDS - 1, Math.max(0, Math.floor(dot.phase * BANDS))) === band),
    DOT_RADIUS,
  ),
}));

/**
 * The broken trident from the Barbados flag in dots, with a wave of light rising from the shaft to the
 * three points. A dim trident sits under one layer per band, and only the layers' opacity animates,
 * so the browser can run the wave on the GPU while the page is busy loading.
 */
export function Loader({
  size = 64,
  label = "Loading",
  className,
}: {
  size?: number;
  /** Null makes the trident decorative when its caller supplies visible status text. */
  label?: string | null;
  className?: string;
}) {
  return (
    <span
      role={label === null ? undefined : "status"}
      aria-hidden={label === null || undefined}
      className={cn("trident-loader relative inline-block", className)}
      style={{ width: round((size * WIDTH) / HEIGHT), height: size }}
    >
      <svg
        viewBox={VIEW_BOX}
        className="absolute inset-0 size-full"
        fill="currentColor"
        fillOpacity={0.32}
        aria-hidden
      >
        <path d={REST_PATH} />
      </svg>
      {WAVE.map((band) => (
        <svg
          key={band.delay}
          viewBox={VIEW_BOX}
          className="trident-loader-band absolute inset-0 size-full"
          style={{ animationDelay: `calc(${band.delay} * var(--trident-cycle))` }}
          fill="currentColor"
          aria-hidden
        >
          <path d={band.path} />
        </svg>
      ))}
      {label !== null && <span className="sr-only">{label}</span>}
    </span>
  );
}
