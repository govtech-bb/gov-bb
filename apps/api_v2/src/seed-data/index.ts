/**
 * The seed corpus: the live estate's markdown and categories, as
 * `scripts/build-seed-data.ts` snapshotted them into `estate.json`.
 *
 * A committed snapshot rather than a read of `apps/landing` at boot, because
 * the running API ships without the landing app's source.
 */

import type { Frontmatter, Visibility } from "../modules/page";
import estateJson from "./estate.json";

export interface SeedCategory {
  slug: string;
  title: string;
  description: string | null;
  /** The parent category's slug, for a subcategory. */
  parent: string | null;
  position: number;
}

export interface SeedPage {
  url: string;
  /** A category slug, resolved to `category_id` at seed time. */
  category: string | null;
  /** The parent page's url, resolved to `parent_id` at seed time. */
  parent: string | null;
  title: string;
  description: string | null;
  visibility: Visibility;
  form_id: string | null;
  /** The frontmatter's `publish_date`, when it has one. */
  published_at: string | null;
  body_markdown: string;
  frontmatter: Frontmatter;
}

export interface SeedEstate {
  categories: SeedCategory[];
  pages: SeedPage[];
}

export const ESTATE = estateJson as SeedEstate;
