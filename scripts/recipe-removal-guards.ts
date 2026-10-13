/**
 * Recipe removal guard (#2409): a PR — a builder `Publish form:` one included —
 * must not silently drop a form's delivery, routing or geocoding. Processors
 * carry no ids, so each category is compared by count against the base
 * revision, and only a drop is reported; an addition or a reshuffle passes.
 * `geocodeTargets` and `address-lookup` refs are counted anywhere in the
 * recipe, which covers a `blocks/*` ref's per-child override record too.
 * Returns human-readable error strings (empty when clean).
 */
import { isRecord } from "./recipe-content";

function processors(recipe: unknown): Record<string, unknown>[] {
  const list = isRecord(recipe) ? recipe.processors : undefined;
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Every object in the tree, depth first. */
function* objects(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* objects(item);
  } else if (isRecord(value)) {
    yield value;
    for (const item of Object.values(value)) yield* objects(item);
  }
}

function countObjects(
  recipe: unknown,
  match: (o: Record<string, unknown>) => boolean,
): number {
  let n = 0;
  for (const o of objects(recipe)) if (match(o)) n++;
  return n;
}

const CATEGORIES: [string, (recipe: unknown) => number][] = [
  [
    "webhook processors",
    (r) => processors(r).filter((p) => p.type === "webhook").length,
  ],
  [
    "MDA-email processors",
    (r) =>
      processors(r).filter(
        (p) =>
          p.type === "email" &&
          isRecord(p.config) &&
          typeof p.config.recipientField === "string" &&
          p.config.recipientField.includes("mdaEmail"),
      ).length,
  ],
  [
    "catchment routing",
    (r) => (isRecord(r) && r.catchmentRouting !== undefined ? 1 : 0),
  ],
  ["geocode targets", (r) => countObjects(r, (o) => "geocodeTargets" in o)],
  [
    "address lookups",
    (r) => countObjects(r, (o) => o.ref === "components/address-lookup"),
  ],
];

export function checkRemovals(
  file: string,
  before: unknown,
  after: unknown,
): string[] {
  const errors: string[] = [];
  for (const [category, count] of CATEGORIES) {
    const was = count(before);
    const now = count(after);
    if (now < was) {
      errors.push(
        `${file}: removes ${category} (base had ${was}, this PR has ${now}). If this is deliberate, add the recipe-removal-override label.`,
      );
    }
  }
  return errors;
}
