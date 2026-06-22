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
 * Scope: `findTitleCollision` itself only compares the rows it's handed. The
 * write handlers in `forms.ts` feed it both the drafts in `form_definitions`
 * *and* the upstream published set (via `fetchPublishedForms`), so a collision
 * against a published-only form is now blocked at the API too — matching the
 * builder UI mirror, which compares against the merged drafts+published list
 * (#556, closing the asymmetry deferred from #545). The upstream consult fails
 * open, so a flaky apps/api falls back to the drafts-only check.
 */

/**
 * Build the "latest version per formId" query for the given column list.
 *
 * The subtle part — `DISTINCT ON (form_id)` paired with the
 * `string_to_array(version, '.')::int[] DESC` ordering so the highest semver
 * (not the lexically-largest string) wins — lives here once. Callers pass only
 * the columns they need.
 *
 * This is the one deliberate DB-side copy of the recipe-version ordering: the
 * canonical TypeScript comparator is `compareSemver` in `@govtech-bb/form-types`
 * (issue #1395 / DUP-02). The Postgres `int[]` cast matches its numeric,
 * segment-wise semantics — keep the two in step if either changes.
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
