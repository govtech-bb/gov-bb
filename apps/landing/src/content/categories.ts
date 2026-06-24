// The category taxonomy is owned by @govtech-bb/content (the single source of
// truth shared with form_builder's CMS). Landing re-exports it under its
// established local names so existing consumers ($.tsx, registry.ts, search.ts)
// keep importing from './categories' unchanged.
export {
  CATEGORY_TAXONOMY as CATEGORIES,
  CATEGORY_BY_SLUG,
  getSubcategory,
} from '@govtech-bb/content/categories'
export type { Category, SubCategory } from '@govtech-bb/content/categories'
