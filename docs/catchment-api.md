# Catchment API integration

The catchment API exposes the same geographic boundaries used by the forms API,
without coupling consumers to CAMS, environmental-health routing, or a database.
Use it for maps and coordinate lookups; keep service-specific decisions in your
application. The endpoints are public and are documented in `/api-docs` on the
API host.

## Endpoints

| Request | Response |
| --- | --- |
| `GET /catchments/polyclinics` | GeoJSON `FeatureCollection` with `datasetId`, `revision`, and eight features. Each feature has a stable `id`, `properties.name`, and the original geometry. |
| `POST /catchments/polyclinics/lookup` | `{ datasetId, revision, catchments }`, containing a geographic result for **every** catchment, including outside areas and overlapping matches. |

POST a JSON body such as `{ "lat": 13.14102, "lng": -59.60607 }`. Both fields
must be finite numbers: latitude from −90 to 90, longitude from −180 to 180.
Missing fields, strings, and unexpected fields receive the API's standard HTTP
400 error response. Successful lookups return HTTP 200, even offshore.

Each lookup result has this shape:

```ts
type CatchmentResult = {
  id: string;
  name: string;
  relation: "inside" | "boundary" | "outside";
  distanceToBoundaryMeters: number;
};
```

`distanceToBoundaryMeters` is the shortest distance to any ring in any component,
including holes. It is an unrounded, approximate local measurement, not a route
distance or an accuracy guarantee. `boundary` uses a 0.001 m numerical tolerance;
that tolerance does not mean the source survey is accurate to a millimetre.
Polygon holes count as outside. A shared border can match multiple catchments;
do not select the first result as a serving clinic.

The public dataset contains no programme codes, serving-clinic redirects, phone
numbers, or email addresses. Existing forms routing still applies its own parish
fallback and environmental-health policies: for example, geographic Frederick
Miller continues to route to St. Philip for environmental health.

| Stable ID | Name |
| --- | --- |
| `branford-taitt` | Branford Taitt Polyclinic |
| `st-philip` | St. Philip Polyclinic |
| `maurice-byer` | Maurice Byer Polyclinic |
| `eunice-gibson` | Eunice Gibson Polyclinic |
| `david-thompson` | David Thompson Health & Social Services Complex |
| `winston-scott` | Sir Winston Scott Polyclinic |
| `randal-phillips` | Randal Phillips Polyclinic |
| `frederick-miller` | Frederick Miller Polyclinic |

Use IDs for application logic and names for display.

## Browser and Leaflet example

Serve your client over HTTP(S). Add its origin to the API's existing
`CORS_ORIGIN` allowlist, including the port for local development. These endpoints
need no authentication or cookies; use `credentials: "omit"`. Opening a prototype
with `file://` is not a supported CORS setup.

The example assumes Leaflet, an existing `map`, a draggable `pin`, and an
`<output id="catchment-result" aria-live="polite"></output>`. Run it in a module
script. Set `api` to the deployed API origin for a separately hosted client.

```js
const api = "http://localhost:3001";
const output = document.getElementById("catchment-result");
const areas = L.geoJSON().addTo(map);
let revision;
let pending;

async function request(path, options = {}) {
  const response = await fetch(api + path, { credentials: "omit", ...options });
  if (!response.ok) throw new Error(`Catchment request failed (${response.status})`);
  return response.json();
}

function showAreas(dataset) {
  areas.clearLayers().addData(dataset);
  revision = dataset.revision;
}

try {
  showAreas(await request("/catchments/polyclinics"));
  map.fitBounds(areas.getBounds());
} catch {
  output.textContent = "Catchment boundaries could not be loaded. Try again.";
}

async function lookupAt(lat, lng) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const { signal } = controller;
  output.textContent = "Checking the selected location…";

  try {
    const result = await request("/catchments/polyclinics/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
      signal,
    });
    if (result.revision !== revision) {
      const dataset = await request("/catchments/polyclinics", {
        cache: "no-cache",
        signal,
      });
      if (dataset.revision !== result.revision) {
        throw new Error("Boundary versions changed during lookup");
      }
      if (signal.aborted) return;
      showAreas(dataset);
    }
    if (signal.aborted) return;
    const matches = result.catchments.filter((c) => c.relation !== "outside");
    output.textContent = matches.length
      ? matches.map((c) => `${c.name}: ${c.relation}`).join("; ")
      : "This location is outside the mapped catchments.";
  } catch {
    if (!signal.aborted) {
      output.textContent = "We could not check this location. Please try again.";
    }
  }
}

pin.on("dragend", () => {
  const { lat, lng } = pin.getLatLng();
  void lookupAt(lat, lng);
});
```

Call `lookupAt(lat, lng)` after address selection or browser geolocation too.
Leaflet's `L.geoJSON` reads GeoJSON's `[longitude, latitude]` coordinates directly;
do not swap the dataset coordinates. `L.marker` and `lookupAt` in this example
use latitude first.

The example aborts obsolete lookups and clears the previous answer immediately.
When a lookup revision differs from the displayed geometry, it reloads geometry
once and only displays the answer if the revisions agree. A rolling deployment
can briefly return different revisions from different instances; show a retry
message rather than looping indefinitely or combining mismatched geometry and
results. On “Start again,” abort the pending request and clear the answer.

GET responses use `application/geo+json`, an ETag, and
`Cache-Control: public, max-age=0, must-revalidate`; let the browser manage
revalidation. POST responses use `Cache-Control: no-store`. Keep coordinates in
the POST body, not query strings, analytics events, or client logs.

## Finder-specific decisions

The prototype's **150 m Eunice Gibson warning** is a consumer rule: find
`id === "eunice-gibson"` and compare its `distanceToBoundaryMeters` with 150,
on either side of the boundary. This is separate from the API's numerical
`boundary` classification.

The prototype's **250 m nearest-area fallback** is also a consumer rule. Only
when every result is outside, find the shortest distance and consider a result
within 250 m as a candidate to confirm. Do not change its geographic relation to
`inside`. Nearness alone does not establish that a point is on land or that a
gap is coastal; the API does not make either claim.

This release preserves the existing coordinates, feature order, and polygon
structure. Four source polygons have known self-intersections; geometry repair
is separate work and is not applied automatically. Sharing this dataset does
not establish clinical appointment-routing policy or Ministry approval for a
new use case.
