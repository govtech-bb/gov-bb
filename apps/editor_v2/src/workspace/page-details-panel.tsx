import { useId } from "react";
import type { TaxonomyCategory } from "../api/client";
import { cn } from "../cn";
import {
  PageDetail,
  PageDetailsSection,
  PageHeadingFields,
  PropertySelect,
  detailCodeControl,
  detailControl,
  detailDateFormat,
  detailShortControl,
  visibilityDots,
  visibilityLabels,
} from "../pages";
import { withLede, type PageDetails } from "./page-details";

const VISIBILITIES = ["public", "preview", "draft"] as const;

/** A content API page's title, introduction and details, edited as the fields the API keeps. */
export function ApiPageDetails({
  details,
  change,
  categories,
  entry,
  publishedAt,
  errors,
}: {
  details: PageDetails;
  change: (details: PageDetails) => void;
  categories: readonly TaxonomyCategory[];
  /** An entry page is filed under a category; the pages beneath it are filed with it. */
  entry: boolean;
  /** When the page first went public; null until it has. */
  publishedAt: string | null;
  errors: Readonly<Record<string, string>>;
}) {
  const id = useId();
  const set = (patch: Partial<PageDetails>) => change({ ...details, ...patch });
  const filed = categories.find((category) => category.id === details.category_id);
  const top = filed?.parent_id ?? filed?.id ?? "";
  const sub = filed?.parent_id ? filed.id : "";
  const subcategories = categories.filter((category) => top && category.parent_id === top);

  const summary = [
    visibilityLabels.get(details.visibility),
    publishedAt && detailDateFormat.format(new Date(publishedAt)),
    details.form_id && `Form: ${details.form_id}`,
    !details.description && "No description",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeadingFields
        title={details.title}
        lede={details.frontmatter.lede ?? ""}
        error={errors.title}
        onTitle={(title) => set({ title })}
        onLede={(lede) => change(withLede(details, lede))}
      />
      <PageDetailsSection summary={summary}>
        <PageDetail id={`${id}-url`} label="Path" error={errors.url}>
          <input
            id={`${id}-url`}
            className={detailCodeControl}
            value={details.url}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => set({ url: event.target.value })}
          />
        </PageDetail>
        <PageDetail id={`${id}-description`} label="Description" error={errors.description}>
          <textarea
            id={`${id}-description`}
            className={cn(
              detailControl,
              "resize-none supports-[field-sizing:content]:field-sizing-content",
            )}
            rows={2}
            value={details.description ?? ""}
            placeholder="Short summary for listings and search"
            onChange={(event) => set({ description: event.target.value || null })}
          />
        </PageDetail>
        {entry && (
          <PageDetail
            id={`${id}-category`}
            label="Categories"
            error={errors.category ?? errors.category_id}
          >
            <PropertySelect
              id={`${id}-category`}
              value={top}
              onChange={(event) => set({ category_id: event.target.value || null })}
            >
              <option value="">Choose a category</option>
              {categories.flatMap((category) =>
                category.parent_id === null
                  ? [
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>,
                    ]
                  : [],
              )}
            </PropertySelect>
          </PageDetail>
        )}
        {entry && subcategories.length > 0 && (
          <PageDetail id={`${id}-subcategory`} label="Subcategory" error={errors.subcategory}>
            <PropertySelect
              id={`${id}-subcategory`}
              value={sub}
              onChange={(event) => set({ category_id: event.target.value || top })}
            >
              <option value="">None</option>
              {subcategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title}
                </option>
              ))}
            </PropertySelect>
          </PageDetail>
        )}
        <PageDetail id={`${id}-visibility`} label="Visibility" error={errors.visibility}>
          <PropertySelect
            id={`${id}-visibility`}
            dot={visibilityDots.get(details.visibility)}
            value={details.visibility}
            onChange={(event) =>
              set({
                visibility:
                  VISIBILITIES.find((value) => value === event.target.value) ?? details.visibility,
              })
            }
          >
            {VISIBILITIES.map((value) => (
              <option key={value} value={value}>
                {visibilityLabels.get(value)}
              </option>
            ))}
          </PropertySelect>
        </PageDetail>
        <PageDetail id={`${id}-date`} label="Publication date" plain>
          <p className={cn("px-2 py-1 leading-normal", publishedAt ? "text-ink" : "text-subtle")}>
            {publishedAt
              ? detailDateFormat.format(new Date(publishedAt))
              : "Set when the page is first made public"}
          </p>
        </PageDetail>
        <PageDetail id={`${id}-form`} label="Form ID" error={errors.form_id}>
          <input
            id={`${id}-form`}
            className={cn(detailCodeControl, detailShortControl)}
            value={details.form_id ?? ""}
            placeholder="No form linked"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => set({ form_id: event.target.value || null })}
          />
        </PageDetail>
      </PageDetailsSection>
    </>
  );
}
