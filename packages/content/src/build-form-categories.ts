export interface FormCategorySource {
  form_id?: string;
  category?: string;
  categories?: string[];
}

/** form_id → primary category slug (categories[0] ?? category). Skips entries lacking either. */
export function buildFormCategories(
  services: FormCategorySource[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of services) {
    if (!s.form_id) continue;
    const category = s.categories?.[0] ?? s.category;
    if (!category) continue;
    out[s.form_id] = category;
  }
  return out;
}
