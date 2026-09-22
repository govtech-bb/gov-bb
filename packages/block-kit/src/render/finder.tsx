import { useMemo, useState } from "react";
import {
  isOpenAt,
  matchesFacets,
  matchesSearch,
  type FacetSelection,
  type RecordRow,
} from "../facets";
import type { Facet, FinderBlock } from "../types";
import type { RenderContext } from "./spans";
import { hrefAttr } from "../href";

/** Options for a facet, either listed inline or drawn from a collection. */
function optionsFor(
  facet: Facet,
  ctx: RenderContext,
): Array<{ value: string; label: string; default?: boolean }> {
  if (facet.allowed_values_from) {
    const rows = ctx.data[facet.allowed_values_from] ?? [];
    return rows.map((row) => ({
      value: String(row.name ?? row.key ?? ""),
      label: String(row.name ?? row.key ?? ""),
    }));
  }
  return facet.allowed_values ?? [{ value: "yes", label: facet.name }];
}

function defaultSelections(
  facets: Facet[],
  ctx: RenderContext,
): Record<string, FacetSelection> {
  const initial: Record<string, FacetSelection> = {};
  for (const facet of facets) {
    initial[facet.key] = optionsFor(facet, ctx)
      .filter((option) => option.default)
      .map((option) => option.value);
  }
  return initial;
}

function compare(a: RecordRow, b: RecordRow, key: string): number {
  const left = a[key];
  const right = b[key];
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

/** English plural of the configured noun. "pharmacy" must not become "pharmacys". */
function plural(noun: string, count: number): string {
  if (count === 1) return noun;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

/**
 * A metadata cell. A computed facet key (`openNow`) has no stored field, so
 * it resolves through the same predicate registry the sidebar filters with.
 */
function metadataValue(
  row: RecordRow,
  field: string,
  now: Date | null,
): string | null {
  if (field === "openNow") {
    if (!now || !row.hours) return null;
    return isOpenAt(row, now) ? "Open now" : "Closed";
  }
  const value = row[field];
  return value == null || value === "" ? null : String(value);
}

export function FinderIsland({
  block,
  ctx,
  now = new Date(),
}: {
  block: FinderBlock;
  ctx: RenderContext;
  now?: Date | null;
}) {
  // Memoised: `ctx.data[key] ?? []` is a fresh array on every render, which
  // would make the results useMemo below recompute each time.
  const rows = useMemo(
    () => ctx.data[block.collection] ?? [],
    [ctx.data, block.collection],
  );

  // Re-keyed on the block's facet configuration, so editing a facet in the
  // editor resets the sidebar rather than stranding a selection on a facet
  // that no longer exists.
  const facetSignature = JSON.stringify(block.facets.map((f) => f.key));
  const [selections, setSelections] = useState<Record<string, FacetSelection>>(
    () => defaultSelections(block.facets, ctx),
  );
  const [appliedTo, setAppliedTo] = useState(facetSignature);
  if (appliedTo !== facetSignature) {
    setAppliedTo(facetSignature);
    setSelections(defaultSelections(block.facets, ctx));
  }

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(
    () =>
      block.sort.find((option) => option.default)?.key ?? block.sort[0]?.key,
  );
  const [page, setPage] = useState(1);

  const results = useMemo(() => {
    const matched = rows.filter(
      (row) =>
        matchesFacets(row, block.facets, selections, now) &&
        (!block.search.enabled ||
          matchesSearch(row, query, block.search.fields)),
    );
    // 'distance' needs geolocation, which the spike does not ask for; it
    // falls back to name so the option is still visibly selectable.
    const key =
      sortKey && sortKey !== "distance" ? sortKey : block.result_template.title;
    return [...matched].sort((a, b) => compare(a, b, key));
  }, [rows, block, selections, query, sortKey, now]);

  const perPage = block.results_per_page;
  const pageCount = Math.max(1, Math.ceil(results.length / perPage));
  const current = Math.min(page, pageCount);
  const visible = results.slice((current - 1) * perPage, current * perPage);

  const toggle = (facet: Facet, value: string) => {
    setPage(1);
    setSelections((previous) => {
      const selected = previous[facet.key] ?? [];
      if (facet.type === "radio") {
        return {
          ...previous,
          [facet.key]: selected.includes(value) ? [] : [value],
        };
      }
      return {
        ...previous,
        [facet.key]: selected.includes(value)
          ? selected.filter((entry) => entry !== value)
          : [...selected, value],
      };
    });
  };

  return (
    <div className="bk-finder">
      <aside className="bk-finder-sidebar" aria-label="Filters">
        {block.search.enabled ? (
          <div className="bk-facet">
            <label className="bk-facet-name" htmlFor={`${block.id}-search`}>
              {block.search.label}
            </label>
            <input
              id={`${block.id}-search`}
              type="search"
              className="bk-search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
        ) : null}

        {block.facets.map((facet) => {
          const options = optionsFor(facet, ctx);
          const selected = selections[facet.key] ?? [];
          return (
            <fieldset
              key={facet.key}
              className={`bk-facet ${facet.large ? "bk-facet-large" : ""}`}
              data-facet={facet.key}
            >
              <legend className="bk-facet-name">{facet.name}</legend>
              {options.map((option) => (
                <label key={option.value} className="bk-facet-option">
                  <input
                    type={facet.type === "radio" ? "radio" : "checkbox"}
                    name={`${block.id}-${facet.key}`}
                    checked={selected.includes(option.value)}
                    onChange={() => toggle(facet, option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </aside>

      <div className="bk-finder-results">
        <div className="bk-finder-toolbar">
          <p className="bk-result-count" aria-live="polite">
            {results.length} {plural(block.document_noun, results.length)}
          </p>
          {block.sort.length > 0 ? (
            <label className="bk-sort">
              Sort by{" "}
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value)}
              >
                {block.sort.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <p className="bk-empty">
            {ctx.loading ? "Loading…" : block.empty_message}
          </p>
        ) : (
          <ul className="bk-result-list">
            {visible.map((row, index) => (
              <li key={String(row.slug ?? index)} className="bk-result">
                <a
                  className="bk-result-title"
                  {...hrefAttr(
                    block.result_template.detail_url.replace(
                      /\{(\w+)\}/g,
                      (_, field: string) => String(row[field] ?? ""),
                    ),
                  )}
                >
                  {String(row[block.result_template.title] ?? "")}
                </a>
                <p className="bk-result-meta">
                  {block.result_template.metadata
                    .map((field) => metadataValue(row, field, now))
                    .filter((value): value is string => Boolean(value))
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 ? (
          <nav className="bk-pagination" aria-label="Pagination">
            <button
              type="button"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              Page {current} of {pageCount}
            </span>
            <button
              type="button"
              disabled={current === pageCount}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
