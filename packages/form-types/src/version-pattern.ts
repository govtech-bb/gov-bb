import { z } from "zod";

/**
 * Canonical version pattern for a deployed form recipe. The platform only ever
 * emits a plain `X.Y.Z` semantic version, so the contract schema pins exactly
 * that — no prerelease/build metadata and no `v` prefix.
 *
 * Beyond keeping the version field semantically honest, this is a security
 * backstop: `version` flows into the GitHub publish branch name and the recipe
 * file path (`/contents/recipes/<formId>/<version>.json`). Constraining it to
 * `\d+\.\d+\.\d+` keeps a malicious/junk version out of those request URLs
 * (defence-in-depth alongside the `encodeURIComponent` at the sink — #935).
 */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Human-readable hint shown when a version fails {@link SEMVER_PATTERN}. */
export const SEMVER_ERROR = "Use a semantic version like 1.2.0";

/** Reusable zod schema for a recipe/contract `version` field. */
export const semverSchema = z.string().regex(SEMVER_PATTERN, SEMVER_ERROR);
