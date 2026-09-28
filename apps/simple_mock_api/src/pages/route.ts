import type { DatabaseSync } from "node:sqlite";
import { Router } from "express";
import type { Root } from "hast";
import type {
  Frontmatter,
  PageResponse,
} from "@govtech-bb/landing-v2-contract";
import { breadcrumbs } from "./breadcrumbs.js";
import hideStartLinks from "./hide-start-links.js";
import {
  resolvePageLevel,
  shouldHideStartLink,
  startSubPageLevel,
  visibilityOf,
  type ViewLevel,
} from "./visibility.js";

type PageRow = { slug: string; url: string; frontmatter: string; hast: string };

/**
 * `GET /pages?url=…` — the public-only slice of the page branch of v1's
 * catch-all loader (`apps/landing/src/routes/$.tsx`, 109–198).
 */
export function createPagesRouter(db: DatabaseSync): Router {
  const pageByUrl = db.prepare(
    "SELECT slug, url, frontmatter, hast FROM pages WHERE url = ?",
  );
  const allUrls = db.prepare("SELECT url FROM pages");
  const formVisibility = db.prepare(
    "SELECT visibility FROM forms WHERE form_id = ?",
  );
  const ownVisibility = visibilityOf(db);

  const findPage = (url: string) => pageByUrl.get(url) as PageRow | undefined;

  /** v1 `urlLevel`: the effective level of the page at `url`; unknown → public. */
  const urlLevel = (url: string): ViewLevel => {
    const page = findPage(url);
    return page ? resolvePageLevel(page.slug, ownVisibility) : "public";
  };

  /**
   * Canonical URL keyed by a page's leaf slug; leaves shared by several pages
   * (e.g. `start`) are ambiguous and dropped. Copy of `URL_BY_LEAF` from
   * `apps/landing/src/content/registry.ts` (465–476), read from the pages
   * table per call.
   */
  const urlByLeaf = (): Map<string, string> => {
    const byLeaf = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const p of allUrls.all() as { url: string }[]) {
      const leaf = p.url.split("/").pop();
      if (!leaf) continue;
      if (byLeaf.has(leaf)) ambiguous.add(leaf);
      else byLeaf.set(leaf, p.url);
    }
    for (const leaf of ambiguous) byLeaf.delete(leaf);
    return byLeaf;
  };

  /**
   * The canonical URL a bare single-segment slug should 301 to, or undefined.
   * Copy of `resolveBareSlugRedirect` from
   * `apps/landing/src/content/registry.ts` (516–527) for the public viewer.
   */
  const resolveBareSlugRedirect = (slug: string): string | undefined => {
    const key = slug.replace(/^\/+|\/+$/g, "");
    if (!key || key.includes("/")) return undefined;
    const url = urlByLeaf().get(key);
    if (!url || url === key) return undefined;
    if (urlLevel(url) !== "public") return undefined;
    return url;
  };

  const router = Router();

  router.get("/pages", (req, res) => {
    const { url } = req.query;
    if (typeof url !== "string" || !url) {
      res
        .status(400)
        .json({ error: 'Query parameter "url" must be a non-empty string' });
      return;
    }

    const page = findPage(url.replace(/^\/+|\/+$/g, ""));
    if (!page) {
      const redirectTo = resolveBareSlugRedirect(url);
      if (redirectTo) {
        const path = `/${redirectTo}`;
        res.status(301).location(path).json({ redirect: path });
        return;
      }
      res.status(404).json({ error: "Page not found" });
      return;
    }

    if (resolvePageLevel(page.slug, ownVisibility) !== "public") {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    const frontmatter = JSON.parse(page.frontmatter) as Frontmatter;
    const formId = frontmatter.form_id;
    const formPublic = formId
      ? (formVisibility.get(formId) as { visibility: string } | undefined)
          ?.visibility === "public"
      : true;

    // The `/start` sub-page IS the online-application step: hidden with its form.
    if (page.slug.endsWith("/start") && formId !== undefined && !formPublic) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    const hast = JSON.parse(page.hast) as Root;
    hideStartLinks({
      hideStartLink: shouldHideStartLink({
        startSubPageVisible: startSubPageLevel(db, page.slug) === "public",
        formId,
        formPublic,
      }),
    })(hast);

    const body: PageResponse = {
      url: page.url,
      frontmatter,
      hast,
      breadcrumbs: breadcrumbs(db, page.url, frontmatter.title),
    };
    res.json(body);
  });

  return router;
}
