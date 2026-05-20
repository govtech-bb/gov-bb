/**
 * Build the INSERT INTO form_definitions statement for export/download.
 * Uses Postgres dollar-quoted strings ($recipe$ ... $recipe$) so the JSON
 * literal can contain single quotes without escaping.
 */
export function buildSql(formId: string, recipe: Record<string, any>): string {
  const json = JSON.stringify(recipe, null, 2);
  return `INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '${formId}',
  '1.0.0',
  $recipe$${json}$recipe$,
  NOW(),
  NOW(),
  NOW()
);`;
}
