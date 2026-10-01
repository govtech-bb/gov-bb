/**
 * The seed corpus: the live estate's markdown, categories and forms, as
 * `scripts/build-seed-data.ts` snapshotted them into `estate.json`.
 *
 * A committed snapshot rather than a read of `apps/landing` at boot, because
 * the running API ships without the landing app's source.
 */

import type { Frontmatter, Visibility } from "../schema";
import estateJson from "./estate.json";

export interface SeedCategory {
  slug: string;
  title: string;
  description: string | null;
}

export interface SeedForm {
  form_id: string;
  visibility: Visibility;
}

export interface SeedPage {
  url: string;
  /** A category slug, resolved to `category_id` at seed time. */
  category: string | null;
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
  forms: SeedForm[];
  pages: SeedPage[];
}

export const ESTATE = estateJson as SeedEstate;
