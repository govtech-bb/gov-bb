# Shared catchment geography API

## Context

The polyclinic finder needs the same boundaries as CAMS without inheriting its
environmental-health routing rules or maintaining a separate geometry copy.

## Changes

- Extracted an independent geometry module that loads the canonical GeoJSON
  once and supports containment and approximate boundary-distance lookup.
- Added public GeoJSON and coordinate-lookup endpoints under
  `/catchments/polyclinics`, with stable IDs, content revisions, ETag caching,
  validated POST input, and existing rate-limiting infrastructure.
- Added only stable feature IDs to the source dataset. Coordinates, properties,
  polygon structure, and feature order are unchanged.
- Existing routing consumes the shared geometry while preserving first-match
  behavior, parish fallback, programme codes, contacts, and the Frederick Miller
  to St. Philip environmental-health redirect.
- Documented Leaflet integration, revision handling, and consumer-owned 150 m
  warnings and 250 m nearest-area suggestions in `docs/catchment-api.md`.

## Validation and limits

On the latest `main` base, API tests passed (1,686 passed, 10 skipped), API lint
passed, and the workspace build passed for all 21 local targets (`landing`
excluded as documented in `CLAUDE.md`). The packaged-GeoJSON loading check
passed, and comparison against the original dataset confirmed that only IDs
were added.

Four source polygons retain known self-intersections; this change does not
repair geometry or establish clinical appointment-routing policy. Geometry
results expose no contact details or CAMS programme codes.
