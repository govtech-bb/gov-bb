import { Heading, Text } from '@govtech-bb/react'

export interface OrgStep {
  title: string
  description: string
}

/**
 * A GOV.UK-style step by step: the connector runs behind each disc so stacked
 * steps join into one line. The warning follows GOV.UK warning text.
 */
export function OrgSteps({
  items,
  warning,
}: {
  items: Array<OrgStep>
  warning?: string
}) {
  return (
    <>
      <ol>
        {items.map((step, index) => (
          <li
            key={step.title}
            className="relative flex gap-5 before:absolute before:inset-y-0 before:left-[17px] before:w-0.5 before:bg-grey-40 last:before:hidden"
          >
            <span className="govbb-text-h4 relative grid size-9 shrink-0 place-items-center rounded-full border-2 border-black-00 bg-white-00">
              {index + 1}
            </span>
            <div className="flex-1 space-y-xs pb-10">
              <Heading as="h3" size="h4">
                {step.title}
              </Heading>
              <Text as="p">{step.description}</Text>
            </div>
          </li>
        ))}
      </ol>
      {warning ? (
        <div className="govbb-text-h4 flex items-start gap-s">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-black-00 text-white-00"
          >
            !
          </span>
          <strong className="font-semibold">
            <span className="sr-only">Warning: </span>
            {warning}
          </strong>
        </div>
      ) : null}
    </>
  )
}
