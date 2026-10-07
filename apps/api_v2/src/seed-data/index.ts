/**
 * The seed corpus: the live estate's markdown and categories, as
 * `scripts/build-seed-data.ts` snapshotted them into `estate.json`.
 *
 * A committed snapshot rather than a read of `apps/landing` at boot, because
 * the running API ships without the landing app's source.
 */

import { z } from "zod";
import { Frontmatter, PageUrl, Visibility } from "../modules/page";
import estateJson from "./estate.json";

const SeedCategory = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  /** The parent category's slug, for a subcategory. */
  parent: z.string().nullable(),
  position: z.int(),
});

/** A snapshotted category, filed under its parent's slug. */
export type SeedCategory = z.infer<typeof SeedCategory>;

const SeedPage = z.object({
  url: PageUrl,
  /** A category slug, resolved to `category_id` at seed time. */
  category: z.string().nullable(),
  /** The parent page's url, resolved to `parent_id` at seed time. */
  parent: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  visibility: Visibility,
  form_id: z.string().nullable(),
  /** The frontmatter's `publish_date`, when it has one. */
  published_at: z.string().nullable(),
  body_markdown: z.string(),
  frontmatter: Frontmatter,
});

/** A snapshotted page, filed under its category's slug and its parent's url. */
export type SeedPage = z.infer<typeof SeedPage>;

const SeedEstate = z.object({
  categories: z.array(SeedCategory),
  pages: z.array(SeedPage),
});

/** The snapshot as `scripts/build-seed-data.ts` writes it. */
export type SeedEstate = z.infer<typeof SeedEstate>;

/** The committed snapshot, parsed. */
export const ESTATE = SeedEstate.parse(estateJson);
