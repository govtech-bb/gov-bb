/**
 * eho-frederick-miller-local.smoke.spec.ts
 *
 * LOCAL-ONLY smoke for `request-an-environmental-health-officer`, pinned to the
 * catchment case that is easiest to get wrong: an event whose coordinates fall
 * inside the **Frederick Miller** catchment must be routed to, and named as,
 * **St. Philip Polyclinic** (Frederick Miller has no Environmental Health
 * Department of its own — SERVING_CATCHMENT redirects it).
 *
 * Gun Hill is the control that makes the assertion mean something. It sits in
 * Frederick Miller's polygon but in the parish of **St. George**, whose
 * PARISH_DEFAULTS entry is David Thompson — so "St. Philip" on the confirmation
 * screen can only have come from the coordinate hit plus the redirect, never
 * from the parish fallback.
 *
 * Run against a local stack only:
 *   SMOKE_BASE_URL=http://localhost:4300 VITE_API_URL=http://localhost:3011 \
 *     PREVIEW_TOKEN=… pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts eho-frederick-miller-local --headed
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "request-an-environmental-health-officer";

/** A geocodable landmark inside the Frederick Miller polygon, in St. George. */
const FREDERICK_MILLER_ADDRESS = "Gun Hill";

const GEOJSON = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../api/src/catchment/polyclinic-catchments.geojson",
);

type Ring = [number, number][];

/** Ray-cast point-in-ring; GeoJSON rings are [lng, lat]. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/** Every GeoJSON catchment whose geometry contains "lat,lng". */
function catchmentsContaining(coordinates: string): string[] {
  const [lat, lng] = coordinates.split(",").map(Number);
  const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8")) as {
    features: {
      properties: { name: string };
      geometry: { type: string; coordinates: unknown };
    }[];
  };
  return geo.features
    .filter((f) => {
      const polys = (
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates as Ring[]]
          : (f.geometry.coordinates as Ring[][])
      ) as Ring[][];
      return polys.some(
        (poly) =>
          poly.length > 0 &&
          inRing(lng, lat, poly[0]) &&
          !poly.slice(1).some((hole) => inRing(lng, lat, hole)),
      );
    })
    .map((f) => f.properties.name);
}

/** Minimal valid answer set; the address is pinned, not faked. */
function buildData() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return {
    firstName: "Smoke",
    lastName: "Tester",
    addressLine1: "1 Test Road",
    telephone: "246 249 1234",
    applicantEmail: "testing@govtech.bb",
    eventName: `Frederick Miller catchment smoke ${new Date().toISOString()}`,
    start,
    end,
    startTime: "16:00",
    endTime: "22:00",
    numPatrons: "300",
    numStalls: "4",
    otherFood: "Cutters (smoke test)",
    supplierDetails: "Dry goods from a wholesaler",
    handlersMale: "2",
    handlersFemale: "3",
    waterSource: "Mains supply",
    handwashing: "Portable station with soap and paper towels",
    wasteDisposal: "Bagged and collected daily",
  };
}

test("routes a Frederick Miller event to St. Philip and mints an MOH-EHO reference", async ({
  page,
}, testInfo) => {
  const data = buildData();

  // ─── Open (preview token: the recipe is visibility:draft) ─────────────────
  const previewToken = process.env.PREVIEW_TOKEN;
  await page.goto(
    previewToken
      ? `/forms/${FORM_ID}?preview=${encodeURIComponent(previewToken)}`
      : `/forms/${FORM_ID}`,
  );
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });

  // ─── Gate: serving food ───────────────────────────────────────────────────
  let step = expectStep(page, "operating-restaurant");
  await selectRadio(page, step, "operating-restaurant", "yes");
  await advance(page, step);

  // ─── Your details ─────────────────────────────────────────────────────────
  step = expectStep(page, "applicant-details");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "applicant-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "applicant-parish", "st-michael");
  await fillField(page, step, "telephone", data.telephone);
  await fillField(page, step, "email", data.applicantEmail);
  await advance(page, step);

  // ─── About the event ──────────────────────────────────────────────────────
  step = expectStep(page, "event-details");
  await fillField(page, step, "event-name", data.eventName);

  // Type the landmark, pick the first geocoder suggestion, then read the hidden
  // coordinates the catchment router will resolve from — WHILE the step is
  // still mounted (they are gone once we advance).
  const combo = page.getByRole("combobox", { name: "Event address line 1" });
  await combo.click();
  await combo.pressSequentially(FREDERICK_MILLER_ADDRESS, { delay: 20 });
  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${FREDERICK_MILLER_ADDRESS}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinatesInput = page.locator(
    `input[id="${step}_event-address-coordinates"]`,
  );
  await expect(
    coordinatesInput,
    "geocoder did not populate the hidden event coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  const coordinates = (await coordinatesInput.inputValue()).trim();

  const eventParish = await page
    .locator(`select[id="${step}_event-parish"]`)
    .inputValue();

  await fillDate(
    page,
    step,
    "event-from",
    data.start.getDate(),
    data.start.getMonth() + 1,
    data.start.getFullYear(),
  );
  await fillDate(
    page,
    step,
    "event-to",
    data.end.getDate(),
    data.end.getMonth() + 1,
    data.end.getFullYear(),
  );
  await fillField(page, step, "event-start-time", data.startTime);
  await fillField(page, step, "event-end-time", data.endTime);
  await fillField(page, step, "num-patrons", data.numPatrons);
  await fillField(page, step, "num-stalls", data.numStalls);
  await advance(page, step);

  // The geocoded coordinates must actually be in Frederick Miller — otherwise
  // a "St. Philip" confirmation proves nothing about the redirect.
  const hits = catchmentsContaining(coordinates);
  expect(
    hits,
    `"${FREDERICK_MILLER_ADDRESS}" geocoded to ${coordinates}, which is not in the Frederick Miller catchment`,
  ).toEqual(["Frederick Miller Polyclinic"]);
  console.log(`[catchment] ${coordinates} → ${hits.join(", ")}`);

  // The parish the geocoder filled must NOT be st-philip, or the parish
  // fallback could produce the same answer as the coordinate hit and the test
  // would prove nothing. st-george maps to David Thompson.
  expect(
    eventParish,
    "event parish must not be st-philip, or the fallback confounds the result",
  ).not.toBe("st-philip");
  console.log(`[parish] geocoder filled event-parish=${eventParish}`);

  // ─── Food and drink ───────────────────────────────────────────────────────
  step = expectStep(page, "food-details");
  await page.getByRole("checkbox", { name: "Other food", exact: true }).check();
  await fillField(page, step, "other-food-description", data.otherFood);
  await page.locator(`input[id="${step}_food-source-supplier"]`).check();
  await expect(page.locator(`[id="${step}_supplier-details"]`)).toBeVisible({
    timeout: STEP_TIMEOUT,
  });
  await fillField(page, step, "supplier-details", data.supplierDetails);
  await advance(page, step);

  // ─── Food safety ──────────────────────────────────────────────────────────
  step = expectStep(page, "food-safety");
  await selectRadio(page, step, "has-food-licence", "no");
  await fillField(page, step, "handlers-male", data.handlersMale);
  await fillField(page, step, "handlers-female", data.handlersFemale);
  await fillField(page, step, "water-source", data.waterSource);
  await fillField(page, step, "handwashing", data.handwashing);
  await fillField(page, step, "waste-disposal", data.wasteDisposal);
  await advance(page, step);

  // ─── Documents: all uploads are optional in the local recipe tweak ────────
  step = expectStep(page, "documents");
  await advance(page, step);

  step = expectStep(page, "check-your-answers");
  await advance(page, step);

  // ─── Declaration ──────────────────────────────────────────────────────────
  expectStep(page, "declaration");
  await page
    .getByRole("checkbox", { name: /I confirm that my information is correct/ })
    .check();
  await page
    .getByRole("checkbox", {
      name: /Health Services \(Restaurants\) Regulations, 1969/,
    })
    .check();
  await page
    .getByRole("checkbox", { name: /responsible for the overtime costs/ })
    .check();

  // `referenceLabel` routes the shape assertion through the shared helper,
  // which accepts the two-segment `MDA-PROG` prefix (#2331) as of this branch.
  const response = await submitAndConfirm(page, {
    heading: "Request submitted",
    referenceLabel: "Submission ID",
  });

  const body = await response.json();
  const referenceCode: string =
    body?.data?.referenceCode ?? body?.referenceCode;
  console.log(`[reference] ${referenceCode}`);

  // #2331: the recipe declares mdaCode MOH + programmeShortCode EHO.
  expect(referenceCode).toMatch(/^MOH-EHO-\d{4}-[0-9A-HJKMNP-TV-Z]{7}$/);

  // The {polyclinic} token on the confirmation screen: the SERVING catchment,
  // never the geographic one.
  const confirmation = page.locator("main");
  await expect(confirmation).toContainText("St. Philip Polyclinic");
  await expect(confirmation).not.toContainText("Frederick Miller");

  await page.screenshot({
    path: testInfo.outputPath("submission-confirmation.png"),
    fullPage: true,
  });
  console.log(
    `[screenshot] ${testInfo.outputPath("submission-confirmation.png")}`,
  );
});
