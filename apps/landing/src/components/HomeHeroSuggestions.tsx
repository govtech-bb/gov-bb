/** Marks the label and each suggestion whose next item wraps onto a new line, so no separator is left hanging at the end of a line and a label alone on its line stays centred. */
function markLineEnds(row: HTMLElement | null) {
  if (!row || typeof ResizeObserver === 'undefined') return
  // Read once: each row is keyed on its items, so new items mount a new row.
  const items = [...row.querySelectorAll('.home-hero__suggestions-label, li')]
  const observer = new ResizeObserver(() => {
    items.forEach((item, index) => {
      const next = items.at(index + 1)
      item.toggleAttribute(
        'data-line-end',
        next !== undefined &&
          next.getBoundingClientRect().top >=
            item.getBoundingClientRect().bottom,
      )
    })
  })
  // The row for width changes, each item for the web font swapping in.
  observer.observe(row)
  for (const item of items) observer.observe(item)
  return () => observer.disconnect()
}

export function HomeHeroSuggestions({
  label,
  items,
  hrefFor,
  onFollow,
}: {
  label: string
  items: readonly string[]
  hrefFor: (item: string) => string
  onFollow: (item: string) => void
}) {
  if (items.length === 0) return null

  return (
    <div
      key={items.join('\n')}
      className="home-hero__suggestions"
      ref={markLineEnds}
    >
      <p className="home-hero__suggestions-label">{label}</p>
      <ul className="home-hero__suggestions-list" role="list">
        {items.map((item) => (
          <li key={item}>
            <a
              className="govbb-link"
              href={hrefFor(item)}
              onClick={() => onFollow(item)}
            >
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
