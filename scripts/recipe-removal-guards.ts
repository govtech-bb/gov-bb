/**
 * Recipe removal guard (#2409): a PR — a builder `Publish form:` one included —
 * must not silently drop a form's delivery, routing or geocoding. Processors
 * carry no ids, so each category is compared by count against the base
 * revision, and only a drop is reported; an addition or a reshuffle passes
 * (so does removing one item and adding another in the same category — a
 * known limit). A webhook counts only while its config holds something, and
 * `catchmentRouting` and `geocodeTargets` count their set keys, so emptying
 * any of them, or dropping one of their fields, is a drop.
 * `geocodeTargets` and address lookups (a `components/address-lookup` ref or
 * an inline `htmlType: "address-lookup"`) are counted anywhere in the recipe,
 * which covers a `blocks/*` ref's per-child override record too.
 * Returns human-readable error strings (empty when clean).
 */
import { classifyRecipientField } from "@govtech-bb/form-types";
import { isRecord } from "./recipe-content";

/** True when `value` holds anything but empty strings, arrays and records. */
const hasContent = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasContent)
    : isRecord(value)
      ? Object.values(value).some(hasContent)
      : value !== undefined && value !== null && value !== "";

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
    (r) =>
      processors(r).filter((p) => p.type === "webhook" && hasContent(p.config))
        .length,
  ],
  [
    // Every recipient but a submitted answer (the applicant) is the MDA's.
    "MDA delivery emails",
    (r) =>
      processors(r).filter(
        (p) =>
          p.type === "email" &&
          isRecord(p.config) &&
          typeof p.config.recipientField === "string" &&
          classifyRecipientField(p.config.recipientField) !== "submitted",
      ).length,
  ],
  [
    "catchment routing",
    (r) =>
      isRecord(r) && isRecord(r.catchmentRouting)
        ? Object.values(r.catchmentRouting).filter(hasContent).length
        : 0,
  ],
  [
    "geocode targets",
    (r) => {
      let n = 0;
      for (const o of objects(r)) {
        if (isRecord(o.geocodeTargets)) {
          n += Object.values(o.geocodeTargets).filter(hasContent).length;
        }
      }
      return n;
    },
  ],
  [
    "address lookups",
    (r) =>
      countObjects(
        r,
        (o) =>
          o.ref === "components/address-lookup" ||
          o.htmlType === "address-lookup",
      ),
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
        `${file}: removes ${category} (base had ${was}, this change has ${now}). If this is deliberate, a PR can carry the recipe-removal-override label.`,
      );
    }
  }
  return errors;
}
