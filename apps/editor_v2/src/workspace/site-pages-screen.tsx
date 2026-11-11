import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { EditorApi } from "../api/client";
import { sitePagesQuery } from "../api/queries";
import { visibilityLabels, visibilityTones } from "../pages/visibility";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { ListScreen } from "../ui/list-screen";
import { LoadingState } from "../ui/loading-state";
import { touchTarget } from "../ui/surface";
import { TextLink } from "../ui/text-link";
import { listLoadView } from "./list-load-view";

/** Existing site information pages; titles open the editor, paths open the public site. */
export function SitePagesScreen({ api }: { api: EditorApi }) {
  const pages = useQuery(sitePagesQuery(api));
  const load = listLoadView(pages, "site pages");

  return (
    <ListScreen
      title="Site pages"
      lead="Information about GOV.BB and how the website works."
      notices={load.notices}
      failure={load.failure}
    >
      {!pages.data ? (
        <LoadingState label={load.loadingLabel} />
      ) : pages.data.length === 0 ? (
        <EmptyState title="No site pages" description="There are no site pages to edit." />
      ) : (
        <ul aria-label="Site pages" className="divide-y divide-line">
          {pages.data.map((page) => {
            const href = api.landingUrl(page.url);

            return (
              <li
                key={page.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-6"
              >
                <div className="min-w-0">
                  <TextLink
                    className={`flex w-fit items-center py-1 font-semibold wrap-anywhere ${touchTarget}`}
                    render={<Link to="/site-pages/$pageId" params={{ pageId: page.id }} />}
                  >
                    {page.title}
                  </TextLink>
                  <div className="font-mono text-12 wrap-anywhere text-muted">
                    {href ? (
                      <TextLink
                        external
                        href={href}
                        className={`block w-fit py-1 text-muted ${touchTarget}`}
                      >
                        {page.url}
                      </TextLink>
                    ) : (
                      page.url
                    )}
                  </div>
                </div>
                <Badge tone={visibilityTones.get(page.visibility) ?? "neutral"}>
                  {visibilityLabels.get(page.visibility)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </ListScreen>
  );
}
