import { CaretRight } from "@phosphor-icons/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";
import { CheckboxMark } from "./checkbox";
import { SearchRow } from "./search-row";
import { listEmpty, row, rowIcon, rowLabel } from "./surface";

export type ChecklistRow = {
  /** Tells the rows apart: the callbacks report it. */
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Ticked, partly ticked ("mixed") or not. A tree's row without one, such as a heading, can't be ticked. */
  checked?: boolean | "mixed";
  /** Faded and can't be ticked, though the keyboard still reaches it. */
  disabled?: boolean;
  /** Its level in a tree, from 0. */
  depth?: number;
  /** Whether a tree's row shows the rows under it; leave it out for a row with none under it. */
  expanded?: boolean;
};

type ChecklistProps = {
  /** Names the list for screen readers. */
  label: string;
  /** The rows to show, in order: a tree's are the ones its expanded rows open onto. */
  rows: readonly ChecklistRow[];
  /** A row pressed: true ticks it, as it does a partly ticked one. */
  onCheckedChange: (key: string, checked: boolean) => void;
  onExpandedChange?: (key: string, expanded: boolean) => void;
  /** With it, a search box over the rows. It only reports what's typed: the caller picks the rows that match. */
  onQueryChange?: (query: string) => void;
  query?: string;
  /** The search box's placeholder and name. */
  searchLabel?: string;
  /** Shown when there are no rows, such as for a search that finds nothing. */
  empty?: ReactNode;
  /** For the whole: give it a height, and the rows scroll under the search box. */
  className?: string;
};

/**
 * Rows to tick, such as the blocks a rule shows or hides, each with the kit's checkbox. Rows with depths, or that
 * expand, make a tree. It's one Tab stop: the arrows move between rows (and from the search box into them), Home and
 * End go to the ends, Space ticks, Enter expands a tree's row or ticks it, and Right and Left open and close a row or
 * move to its first child and its parent. The row under the pointer or the focus turns navy, one at a time.
 */
export function Checklist({
  label,
  rows,
  onCheckedChange,
  onExpandedChange,
  onQueryChange,
  query = "",
  searchLabel = "Search",
  empty = "No results",
  className,
}: ChecklistProps) {
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const tree = rows.some((r) => r.expanded !== undefined || !!r.depth);
  // The row the Tab key reaches: the last one focused, while it's still listed
  const current = rows.some((r) => r.key === active) ? active : rows[0]?.key;
  const checkedOf = (r: ChecklistRow) => r.checked ?? (tree ? undefined : false);

  const focusAt = (index: number) => {
    const el = list.current?.querySelectorAll<HTMLElement>("[data-row]")[index];
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  };

  const expand = (r: ChecklistRow, expanded: boolean) =>
    r.expanded !== undefined && r.expanded !== expanded && onExpandedChange?.(r.key, expanded);

  const tick = (r: ChecklistRow) => {
    const checked = checkedOf(r);

    if (r.disabled || checked === undefined) return;
    onCheckedChange(r.key, checked !== true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((r) => r.key === current);
    const at = rows[index];

    if (!at) return;
    const handled = () => event.preventDefault();

    switch (event.key) {
      case "ArrowDown":
        handled();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        handled();

        if (index === 0) search.current?.focus();
        else focusAt(index - 1);
        break;
      case "Home":
        handled();
        focusAt(0);
        break;
      case "End":
        handled();
        focusAt(rows.length - 1);
        break;
      case "ArrowRight":
        handled();

        if (at.expanded) focusAt(index + 1);
        else expand(at, true);
        break;
      case "ArrowLeft": {
        handled();
        const depth = at.depth ?? 0;

        if (at.expanded) expand(at, false);
        else focusAt(rows.slice(0, index).findLastIndex((r) => (r.depth ?? 0) < depth));
        break;
      }

      case "Enter":
        handled();

        if (at.expanded === undefined) tick(at);
        else expand(at, !at.expanded);
        break;
      case " ":
        handled();
        tick(at);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {onQueryChange && (
        <SearchRow
          ref={search}
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || !rows.length) return;
            event.preventDefault();
            focusAt(0);
          }}
        />
      )}
      <div
        ref={list}
        role={tree ? "tree" : "group"}
        aria-label={label}
        onKeyDown={onKeyDown}
        // The focused row stays navy once the pointer leaves, as a menu's does; nothing does once the focus leaves too
        onPointerLeave={(event) =>
          setHighlight(
            event.currentTarget.contains(document.activeElement) ? (current ?? null) : null,
          )
        }
        onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setHighlight(null)}
        className="min-h-0 overflow-y-auto overscroll-contain py-1 outline-none"
      >
        {rows.length ? (
          rows.map((r) => {
            const checked = checkedOf(r);

            return (
              <div
                key={r.key}
                data-row=""
                role={tree ? "treeitem" : "checkbox"}
                aria-checked={checked}
                aria-level={tree ? (r.depth ?? 0) + 1 : undefined}
                aria-expanded={r.expanded}
                aria-disabled={r.disabled || undefined}
                data-disabled={r.disabled ? "" : undefined}
                data-highlighted={highlight === r.key ? "" : undefined}
                tabIndex={r.key === current ? 0 : -1}
                onFocus={() => {
                  setActive(r.key);
                  setHighlight(r.key);
                }}
                // The pointer moves the highlight, and the focus with it once the focus is in the list, so the
                // keyboard carries on from the row under the pointer
                onPointerMove={(event) => {
                  if (highlight === r.key) return;
                  setHighlight(r.key);

                  if (list.current?.contains(document.activeElement))
                    event.currentTarget.focus({ preventScroll: true });
                }}
                onClick={() => (checked === undefined ? expand(r, !r.expanded) : tick(r))}
                style={
                  r.depth
                    ? { paddingInlineStart: `calc(0.625rem + ${r.depth * 1.25}rem)` }
                    : undefined
                }
                className={row}
              >
                {tree && (
                  <span
                    aria-hidden="true"
                    onClick={(event) => {
                      if (r.expanded === undefined) return;
                      event.stopPropagation();
                      expand(r, !r.expanded);
                    }}
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center text-muted group-data-highlighted/row:text-white [&>svg]:size-3.5 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none",
                      r.expanded && "[&>svg]:rotate-90",
                    )}
                  >
                    {r.expanded !== undefined && <CaretRight />}
                  </span>
                )}
                {checked !== undefined && <CheckboxMark checked={checked} />}
                {r.icon && <span className={rowIcon}>{r.icon}</span>}
                <span className={rowLabel}>{r.label}</span>
              </div>
            );
          })
        ) : (
          <div className={listEmpty}>{empty}</div>
        )}
      </div>
    </div>
  );
}
