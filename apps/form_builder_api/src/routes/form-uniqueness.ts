/**
 * Shared helpers for the form-builder uniqueness checks (issue #545).
 *
 * Two rules, both enforced app-level (a DB unique constraint on title isn't
 * viable because versions of one form deliberately share a title):
 *
 * - `formId` on create must not reuse an id that already belongs to a form.
 * - `title` must be unique across the *latest version of each form*, compared
 *   case-insensitively and whitespace-trimmed.
 *
 * The "latest version per formId" aggregation is the same one that powers
 * `GET /builder/forms`; `latestVersionPerFormSql` is the single source of that
 * ordering so the list endpoint and the title check can't drift apart.
 *
 * Scope: these checks see only the drafts in `form_definitions`, not forms
 * published to the upstream apps/api. The builder UI mirror compares against
 * the merged drafts+published list, so a collision against a *published-only*
 * form is caught client-side but not here. Extending the API check to the
 * published set is tracked in #556 (it would add an upstream dependency to the
 * write path).
 */

/**
 * Build the "latest version per formId" query for the given column list.
 *
 * The subtle part — `DISTINCT ON (form_id)` paired with the
 * `string_to_array(version, '.')::int[] DESC` ordering so the highest semver
 * (not the lexically-largest string) wins — lives here once. Callers pass only
 * the columns they need.
 */
export function latestVersionPerFormSql(columns: string): string {
  return `
    SELECT DISTINCT ON (form_id)
      ${columns}
    FROM form_definitions
    ORDER BY form_id, string_to_array(version, '.')::int[] DESC
  `;
}

/**
 * Normalize a form title for uniqueness comparison: whitespace-trimmed and
 * lowercased, so `"Birth Registration"` collides with `"  birth registration "`.
 */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export interface FormTitleRow {
  form_id: string;
  title: string | null;
}

/**
 * Find an existing form whose title collides with `incomingTitle`, ignoring the
 * form identified by `excludeFormId` (so a form keeping — or renaming to — its
 * own title never collides with itself).
 *
 * Returns the first colliding row, or `null` if there's no collision. An empty
 * incoming title never collides (there's no meaningful title to dedupe yet).
 */
export function findTitleCollision(
  rows: FormTitleRow[],
  incomingTitle: string,
  excludeFormId: string,
): FormTitleRow | null {
  const target = normalizeTitle(incomingTitle);
  if (target === "") return null;
  for (const row of rows) {
    if (row.form_id === excludeFormId) continue;
    if (row.title != null && normalizeTitle(row.title) === target) return row;
  }
  return null;
}
