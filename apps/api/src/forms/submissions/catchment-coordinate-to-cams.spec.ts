import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type WebhookMapping,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { fillParishRoutingCoordinate } from "@/catchment/parish-routing-point";
import { PARISH_ROUTING_POINTS } from "@/catchment/parish-routing-point";
import { hydrateForm, type Resolver } from "../../registry/resolution";
import { buildMappedCasePayload } from "./processors/webhook-mapping";
import type { SubmissionValues } from "./submissions.types";

/**
 * The coordinate reaches the case-management system inside `form_data` — there
 * is no dedicated geo field on the payload — so "did the coordinate get sent?"
 * is answered at the payload boundary, not at the router. Everything between
 * the fill and the wire can drop it silently:
 *
 *  - the coordinate's step named in the webhook's `mapping.excludeSteps`,
 *  - the coordinate field renamed on one side of `catchmentRouting` only,
 *  - a `groupByStep` change moving where it lands.
 *
 * None of those make routing fail, so nothing else goes red: the polyclinic is
 * still named on the confirmation page and the MDA still gets its email, while
 * the CMS quietly receives an application with no location. This walks every
 * routed recipe through the real fill and the real payload builder and asserts
 * the coordinate is on the payload — on the geocoded path AND on the
 * parish-filled path, which is the one that was broken.
 */
const RECIPES_DIR = path.resolve(__dirname, "../form-definitions/recipes");

const resolver: Resolver = async (ref) => {
  const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
  if (!entry) throw new Error(`unresolvable ref "${ref}"`);
  return entry;
};

interface RoutedRecipe {
  formId: string;
  mapping: WebhookMapping;
  coordinatesField: string;
  parishField: string;
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
    routed.push({
      formId: recipe.formId,
      mapping,
      coordinatesField: routing.coordinatesField,
      parishField: routing.parishField,
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
  const [stepId, fieldId] = [
    coordinatesField.slice(0, coordinatesField.indexOf(".")),
    coordinatesField.slice(coordinatesField.indexOf(".") + 1),
  ];
  if (!groupByStep) return formData[fieldId];
  const group = formData[stepId];
  return group && typeof group === "object"
    ? (group as Record<string, unknown>)[fieldId]
    : undefined;
}

function payloadFor(
  recipe: RoutedRecipe,
  values: SubmissionValues,
): Record<string, unknown> {
  const filled = fillParishRoutingCoordinate(values, {
    coordinatesField: recipe.coordinatesField,
    parishField: recipe.parishField,
  });
  const payload = buildMappedCasePayload({
    mapping: recipe.mapping,
    values: filled,
    referenceCode: "REF-1",
    submittedAt: "2026-08-28T00:00:00.000Z",
  });
  return payload.form_data;
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

describe("the catchment coordinate reaches the CMS payload", () => {
  // The parish-filled path: the applicant typed their address instead of picking
  // a suggestion, so nothing geocoded. This is the case that reached the CMS
  // with no coordinate at all before the fill moved server-side.
  it("carries a parish-filled coordinate into form_data for every routed recipe", async () => {
    const missing: string[] = [];

    for (const recipe of await routedRecipes()) {
      const formData = payloadFor(
        recipe,
        valuesWith({ [recipe.parishField]: "st-michael" }),
      );
      const coordinate = coordinateOnPayload(
        formData,
        recipe.coordinatesField,
        recipe.mapping.groupByStep ?? false,
      );
      if (coordinate !== PARISH_ROUTING_POINTS["st-michael"]) {
        missing.push(
          `${recipe.formId}: expected ${recipe.coordinatesField} on form_data, got ${JSON.stringify(coordinate)}`,
        );
      }
    }

    expect(missing).toEqual([]);
  });

  it("carries a geocoded coordinate into form_data for every routed recipe", async () => {
    const missing: string[] = [];

    for (const recipe of await routedRecipes()) {
      const formData = payloadFor(
        recipe,
        valuesWith({
          [recipe.coordinatesField]: "13.0975,-59.6167",
          [recipe.parishField]: "st-michael",
        }),
      );
      const coordinate = coordinateOnPayload(
        formData,
        recipe.coordinatesField,
        recipe.mapping.groupByStep ?? false,
      );
      if (coordinate !== "13.0975,-59.6167") {
        missing.push(
          `${recipe.formId}: expected the geocoded coordinate on form_data, got ${JSON.stringify(coordinate)}`,
        );
      }
    }

    expect(missing).toEqual([]);
  });

  // Both `catchmentRouting` paths are read with a two-level `stepId.fieldId`
  // lookup that refuses an array, so a repeatable routing step resolves nothing,
  // the fill has nothing to write to, and the guard rejects EVERY submission of
  // that form. Cheaper to catch here than in a live outage.
  it("keeps the routing fields out of repeatable steps", async () => {
    const repeatable = (await routedRecipes())
      .filter((r) => r.coordinateStepIsRepeatable)
      .map((r) => `${r.formId}: ${r.coordinatesField} is on a repeatable step`);

    expect(repeatable).toEqual([]);
  });
});
