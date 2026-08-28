import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type WebhookMapping,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import {
  PARISH_ROUTING_POINTS,
  fillParishRoutingCoordinate,
} from "@/catchment/parish-routing-point";
import { hydrateForm, type Resolver } from "../../registry/resolution";
import { buildMappedCasePayload } from "./processors/webhook-mapping";
import type { SubmissionValues } from "./submissions.types";

/**
 * Every catchment-routed form must send the case-management system a coordinate,
 * whatever the applicant did with the address field. This enumerates the routed
 * recipes off disk rather than listing them, so a new routed form is covered the
 * moment it lands — no per-form test to remember to write.
 *
 * The coordinate reaches the CMS inside `form_data` — there is no dedicated geo
 * field on the payload — so "did the coordinate get sent?" is only answerable at
 * the payload boundary, not at the router. Everything between the fill and the
 * wire can drop it silently:
 *
 *  - the coordinate's step named in the webhook's `mapping.excludeSteps`,
 *  - the coordinate field renamed on one side of `catchmentRouting` only,
 *  - a `groupByStep` change moving where it lands.
 *
 * None of those make routing fail, so nothing else goes red: the polyclinic is
 * still named on the confirmation page and the MDA still gets its email, while
 * the CMS quietly receives an application with no location.
 *
 * The ADDRESS conditions below are every way the coordinate field can arrive.
 * What each one leaves in the submitted values is fixed by
 * `address-lookup-field.tsx` and pinned by its own spec — this spec starts from
 * those shapes and carries them the rest of the way to the wire. A new routed
 * form is held to all of them automatically; adding one here holds every
 * existing form to it.
 */
const RECIPES_DIR = path.resolve(__dirname, "../form-definitions/recipes");

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

const GEOCODED = "13.0975,-59.6167";
const PARISH = "st-michael";
const PARISH_POINT = PARISH_ROUTING_POINTS[PARISH];

/**
 * What the applicant did with the address field, and what that leaves in the
 * submitted values. Keyed on behaviour, not on implementation, so the table
 * reads as the product requirement it is.
 */
const ADDRESS_CONDITIONS: {
  what: string;
  /** The coordinate field's submitted value; `undefined` = never written. */
  coordinate: string | undefined;
  expected: string;
}[] = [
  {
    // The happy path: `geocodeTargets` wrote both the coordinate and the parish.
    what: "picked a suggestion",
    coordinate: GEOCODED,
    expected: GEOCODED,
  },
  {
    // Picked a suggestion, then edited the address text. The lookup clears the
    // coordinate it wrote (it belongs to an address no longer on screen), so the
    // server fills from the parish — the coordinate must not survive as the old
    // address's, and must not go missing either.
    what: "overwrote the suggestion",
    coordinate: "",
    expected: PARISH_POINT,
  },
  {
    // Typed the address and never picked a suggestion — no match, a /geocode
    // outage, or just typing. Nothing geocoded, so the field was never written.
    // This is the condition that reached the CMS with no coordinate at all.
    what: "typed the address, never picked a suggestion",
    coordinate: undefined,
    expected: PARISH_POINT,
  },
  {
    // Defensive on the shape check in the fill: a whitespace-only value is not a
    // coordinate and must not block the parish fill.
    what: "left a blank coordinate behind",
    coordinate: "   ",
    expected: PARISH_POINT,
  },
  {
    // Same, for a value that is non-empty but unusable to the point-in-polygon.
    // Nothing an applicant can type reaches this field, so a malformed value is
    // a stray — it must be replaced, not forwarded to the CMS as a location.
    what: "left a malformed coordinate behind",
    coordinate: "not-a-coordinate",
    expected: PARISH_POINT,
  },
];

interface RoutedRecipe {
  formId: string;
  mapping: WebhookMapping;
  coordinatesField: string;
  parishField: string;
  /** The parish field the address lookup writing this coordinate populates. */
  lookupParishField?: string;
  /** Whether the coordinate's step is repeatable (values would be an array). */
  coordinateStepIsRepeatable: boolean;
}

async function routedRecipes(): Promise<RoutedRecipe[]> {
  const files = (await fs.readdir(RECIPES_DIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const routed: RoutedRecipe[] = [];

  for (const file of files.sort()) {
    const recipe = serviceContractRecipeSchema.parse(
      JSON.parse(await fs.readFile(path.join(RECIPES_DIR, file), "utf8")),
    );
    const routing = recipe.catchmentRouting;
    if (!routing) continue;

    const webhook = recipe.processors?.find((p) => p.type === "webhook");
    const mapping =
      webhook?.type === "webhook" ? webhook.config.mapping : undefined;
    // The recipe loader refuses to boot a routed recipe with no mapped webhook,
    // so this is unreachable — but skipping silently would make the suite pass
    // vacuously if that ever changed.
    if (!mapping) throw new Error(`${recipe.formId}: routed with no mapping`);

    const hydrated = await hydrateForm(recipe, resolver);
    const coordinateStepId = routing.coordinatesField.split(".")[0];

    // The address lookup whose `geocodeTargets` writes the routing coordinate —
    // the only thing that ever populates it, so its parish target is the parish
    // the applicant will have answered on the non-geocoded conditions.
    let lookupParishField: string | undefined;
    for (const step of hydrated.steps) {
      for (const element of step.elements) {
        const targets = (
          element as {
            geocodeTargets?: {
              coordinatesFieldId?: string;
              parishFieldId?: string;
            };
          }
        ).geocodeTargets;
        if (!targets?.coordinatesFieldId) continue;
        if (
          `${step.stepId}.${targets.coordinatesFieldId}` !==
          routing.coordinatesField
        ) {
          continue;
        }
        lookupParishField = targets.parishFieldId
          ? `${step.stepId}.${targets.parishFieldId}`
          : undefined;
      }
    }

    routed.push({
      formId: recipe.formId,
      mapping,
      coordinatesField: routing.coordinatesField,
      parishField: routing.parishField,
      lookupParishField,
      coordinateStepIsRepeatable: (
        hydrated.steps.find((s) => s.stepId === coordinateStepId)?.behaviours ??
        []
      ).some((b) => b.type === "repeatable"),
    });
  }

  // A rename that drops the last routed recipe must fail, not pass vacuously.
  if (routed.length === 0) throw new Error("no catchment-routed recipes found");
  return routed;
}

/** Where the coordinate should land on the payload, given `groupByStep`. */
function coordinateOnPayload(
  formData: Record<string, unknown>,
  coordinatesField: string,
  groupByStep: boolean,
): unknown {
  const dot = coordinatesField.indexOf(".");
  const stepId = coordinatesField.slice(0, dot);
  const fieldId = coordinatesField.slice(dot + 1);
  if (!groupByStep) return formData[fieldId];
  const group = formData[stepId];
  return group && typeof group === "object"
    ? (group as Record<string, unknown>)[fieldId]
    : undefined;
}

/** `stepId.fieldId` → the step-nested values shape the payload builder reads. */
function valuesWith(entries: Record<string, string>): SubmissionValues {
  const values: SubmissionValues = {};
  for (const [pathStr, value] of Object.entries(entries)) {
    const dot = pathStr.indexOf(".");
    const stepId = pathStr.slice(0, dot);
    const step = (values[stepId] ?? {}) as Record<string, unknown>;
    values[stepId] = { ...step, [pathStr.slice(dot + 1)]: value };
  }
  return values;
}

/** The coordinate one recipe would send the CMS for one address condition. */
function coordinateSentFor(
  recipe: RoutedRecipe,
  coordinate: string | undefined,
): unknown {
  const values = valuesWith({
    [recipe.parishField]: PARISH,
    ...(coordinate !== undefined && { [recipe.coordinatesField]: coordinate }),
  });
  const payload = buildMappedCasePayload({
    mapping: recipe.mapping,
    values: fillParishRoutingCoordinate(values, {
      coordinatesField: recipe.coordinatesField,
      parishField: recipe.parishField,
    }),
    referenceCode: "REF-1",
    submittedAt: "2026-08-28T00:00:00.000Z",
  });
  return coordinateOnPayload(
    payload.form_data,
    recipe.coordinatesField,
    recipe.mapping.groupByStep ?? false,
  );
}

describe("every catchment-routed form sends the CMS a coordinate", () => {
  it.each(ADDRESS_CONDITIONS)(
    "when the applicant $what",
    async ({ coordinate, expected }) => {
      const wrong: string[] = [];

      for (const recipe of await routedRecipes()) {
        const sent = coordinateSentFor(recipe, coordinate);
        if (sent !== expected) {
          wrong.push(
            `${recipe.formId}: expected ${recipe.coordinatesField} on form_data ` +
              `to be ${JSON.stringify(expected)}, got ${JSON.stringify(sent)}`,
          );
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  // Both non-geocoded conditions fill from the parish the ADDRESS LOOKUP writes,
  // because that is the parish the applicant will have on screen. If the lookup
  // populates a different field from the one `catchmentRouting` reads, those two
  // conditions send no coordinate at all — and the geocoded condition still
  // works, so this drifts silently.
  it("points the address lookup's parish target at the field the routing reads", async () => {
    const mismatched = (await routedRecipes())
      .filter((r) => r.lookupParishField !== r.parishField)
      .map(
        (r) =>
          `${r.formId}: lookup writes ${r.lookupParishField ?? "no parish"}, ` +
          `routing reads ${r.parishField}`,
      );

    expect(mismatched).toEqual([]);
  });

  // Both `catchmentRouting` paths are read with a two-level `stepId.fieldId`
  // lookup that refuses an array, so a repeatable routing step resolves nothing,
  // the fill has nothing to write to, and the coordinate guard rejects EVERY
  // submission of that form. Cheaper to catch here than in a live outage.
  it("keeps the routing fields out of repeatable steps", async () => {
    const repeatable = (await routedRecipes())
      .filter((r) => r.coordinateStepIsRepeatable)
      .map((r) => `${r.formId}: ${r.coordinatesField} is on a repeatable step`);

    expect(repeatable).toEqual([]);
  });
});
