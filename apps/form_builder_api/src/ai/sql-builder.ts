/**
 * Builds a SQL INSERT statement for a form recipe.
 */
export function buildSql(formId: string, recipe: Record<string, any>): string {
  const escaped = JSON.stringify(recipe).replace(/'/g, "''");
  return `INSERT INTO form_definitions (form_id, version, schema, published_at)
VALUES ('${formId}', '${recipe.version ?? "1.0.0"}', '${escaped}'::jsonb, NOW())
ON CONFLICT (form_id, version) DO UPDATE SET schema = EXCLUDED.schema, published_at = NOW();`;
}
