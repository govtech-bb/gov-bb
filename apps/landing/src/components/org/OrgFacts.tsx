export interface OrgFact {
  label: string
  value: string
}

/** Rates, fees and key facts: a label and its value per row, rules between rows. */
export function OrgFacts({ items }: { items: Array<OrgFact> }) {
  return (
    <dl>
      {items.map((fact) => (
        <div
          key={fact.label}
          className="flex flex-col gap-xxs border-t-2 border-grey-20 py-s first:border-t-0 sm:flex-row sm:gap-m"
        >
          <dt className="govbb-text-h4 sm:w-65 sm:shrink-0">{fact.label}</dt>
          <dd className="flex-1">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
