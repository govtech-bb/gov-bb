import * as React from 'react'

export type SortDir = 'asc' | 'desc'

export interface SortState {
  sortKey: string | null
  dir: SortDir
  toggle: (key: string) => void
}

/**
 * Client-side table sort. `accessors` maps a column key to a value extractor;
 * numbers sort numerically, everything else by locale string compare. Clicking
 * a column sorts by it (descending first); clicking the active column flips the
 * direction. Stable initial state so SSR and hydration render the same order.
 */
export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number>,
  initialKey: string | null = null,
  initialDir: SortDir = 'desc',
): { sorted: T[] } & SortState {
  const [sortKey, setSortKey] = React.useState<string | null>(initialKey)
  const [dir, setDir] = React.useState<SortDir>(initialDir)

  const sorted = React.useMemo(() => {
    const acc = sortKey ? accessors[sortKey] : undefined
    if (!acc) return rows
    return [...rows].sort((a, b) => {
      const av = acc(a)
      const bv = acc(b)
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
    // accessors is a stable literal per render site; key/dir drive re-sorts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir])

  const toggle = (key: string) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setDir('desc')
    }
  }

  return { sorted, sortKey, dir, toggle }
}

/** A clickable, keyboard-operable sort header cell. `className` supplies the
 * table's th styling; the arrow reflects the current sort. */
export function SortHeader({
  label,
  colKey,
  sort,
  className,
}: {
  label: string
  colKey: string
  sort: SortState
  className?: string
}) {
  const active = sort.sortKey === colKey
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      tabIndex={0}
      onClick={() => sort.toggle(colKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          sort.toggle(colKey)
        }
      }}
      className={`${className ?? ''} cursor-pointer select-none`}
    >
      {label}
      <span aria-hidden="true" className="text-mid-grey-00">
        {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
      </span>
    </th>
  )
}
