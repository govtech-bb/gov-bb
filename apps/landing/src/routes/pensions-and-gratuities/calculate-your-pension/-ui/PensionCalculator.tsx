import {
  Button,
  ErrorSummary,
  Heading,
  Input,
  Link,
  Text,
} from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { calculatePension } from '../-lib/compute'
import type { PensionEstimate } from '../-lib/compute'

const SERVICE_PATH_SPLAT = 'pensions-and-gratuities/calculate-your-pension'
const ABOUT_URL =
  '/pensions-and-gratuities/calculate-your-pension/about-government-pensions'

const moneyFmt = new Intl.NumberFormat('en-BB', {
  style: 'currency',
  currency: 'BBD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const money = (n: number) => moneyFmt.format(n || 0)

function ServiceTitle() {
  return (
    <div className="border-blue-40 border-l-4 py-xs pl-s">
      <Text as="p" className="text-mid-grey-00">
        Calculate your Government pension
      </Text>
    </div>
  )
}

function ResultCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'teal' | 'green'
}) {
  const toneClasses =
    tone === 'green'
      ? 'border-green-00 bg-green-10 text-green-00'
      : 'border-teal-00 bg-teal-10 text-teal-00'
  return (
    <div className={`rounded-sm border-l-4 px-4 py-3 ${toneClasses}`}>
      <p className="text-mid-grey-00 text-sm">{label}</p>
      <p className="font-bold text-2xl">{value}</p>
    </div>
  )
}

interface FieldErrors {
  startYear?: string
  endYear?: string
  nopayMonths?: string
  salary?: string
}

export function PensionCalculator() {
  const navigate = useNavigate()
  const [startYear, setStartYear] = useState('')
  const [endYear, setEndYear] = useState('')
  const [nopayMonths, setNopayMonths] = useState('')
  const [salary, setSalary] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [estimate, setEstimate] = useState<PensionEstimate | null>(null)
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Move focus to the results region when an estimate appears, so screen-reader
  // and keyboard users are taken to (and hear) the new results after the form
  // is swapped out.
  useEffect(() => {
    if (estimate) resultsRef.current?.focus()
  }, [estimate])

  function validate(): FieldErrors {
    const startVal = startYear.trim()
    const endVal = endYear.trim()
    const nopayVal = nopayMonths.trim()
    const salaryVal = salary.trim()
    const next: FieldErrors = {}

    const startIsYear = /^\d+$/.test(startVal)
    const endIsYear = /^\d+$/.test(endVal)
    const startNum = Number.parseInt(startVal, 10)
    const endNum = Number.parseInt(endVal, 10)

    if (!startVal) {
      next.startYear = 'Enter the year you started pensionable service'
    } else if (!startIsYear || startNum < 1900 || startNum > 2100) {
      next.startYear = 'Enter a start year between 1900 and 2100'
    }

    if (!endVal) {
      next.endYear = 'Enter the year you stopped or will retire'
    } else if (!endIsYear || endNum < 1900 || endNum > 2100) {
      next.endYear = 'Enter an end year between 1900 and 2100'
    } else if (startIsYear && endNum <= startNum) {
      next.endYear = 'The end year must be after the start year'
    } else if (startIsYear && endNum - startNum > 65) {
      next.endYear =
        'The start and end years are more than 65 years apart. Check the years you entered.'
    }

    if (nopayVal) {
      if (!/^\d+$/.test(nopayVal)) {
        next.nopayMonths =
          'Months of no-pay leave must be a whole number of 0 or more'
      } else if (
        startIsYear &&
        endIsYear &&
        endNum > startNum &&
        Number.parseInt(nopayVal, 10) >= (endNum - startNum) * 12
      ) {
        next.nopayMonths =
          'No-pay leave cannot be equal to or more than your total service'
      }
    }

    if (!salaryVal) {
      next.salary = 'Enter your last annual salary'
    } else {
      const cleanedSalary = salaryVal.replace(/,/g, '')
      const salaryNum = Number.parseFloat(cleanedSalary)
      if (
        !/^\d+(\.\d+)?$/.test(cleanedSalary) ||
        !Number.isFinite(salaryNum) ||
        salaryNum <= 0
      ) {
        next.salary = 'Last annual salary must be an amount greater than 0'
      }
    }

    return next
  }

  function calculate() {
    const found = validate()
    setErrors(found)

    if (Object.keys(found).length > 0) {
      setEstimate(null)
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          errorSummaryRef.current?.focus()
          errorSummaryRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        })
      }
      return
    }

    const nopayVal = nopayMonths.trim()
    setEstimate(
      calculatePension({
        startYear: Number.parseInt(startYear, 10),
        endYear: Number.parseInt(endYear, 10),
        nopayMonths: nopayVal ? Number.parseInt(nopayVal, 10) : 0,
        salary: Number.parseFloat(salary.trim().replace(/,/g, '')),
      }),
    )

    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  // Return to the inputs with the entered answers preserved.
  function calculateAgain() {
    setEstimate(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  const errorItems = [
    errors.startYear ? { text: errors.startYear, target: '#start-year' } : null,
    errors.endYear ? { text: errors.endYear, target: '#end-year' } : null,
    errors.nopayMonths
      ? { text: errors.nopayMonths, target: '#nopay-months' }
      : null,
    errors.salary ? { text: errors.salary, target: '#salary' } : null,
  ].filter((e): e is { text: string; target: string } => e !== null)

  // ---- Results view -------------------------------------------------------
  if (estimate) {
    const {
      months,
      startYear: sy,
      endYear: ey,
      nopayMonths: np,
      salary: sal,
    } = estimate
    const monthWord = (n: number) => `${n} month${n === 1 ? '' : 's'}`
    const context =
      `Based on ${monthWord(months)} of pensionable service ` +
      `(${sy} to ${ey}` +
      (np > 0 ? `, less ${monthWord(np)} of no-pay leave` : '') +
      `) and a last annual salary of ${money(sal)}.`

    return (
      <div className="container pt-4 pb-8 lg:pt-6 lg:pb-12">
        <section
          aria-live="polite"
          className="flex flex-col gap-6 focus:outline-none md:w-2/3"
          ref={resultsRef}
          tabIndex={-1}
        >
          <ServiceTitle />
          <Heading as="h1">Your estimated pension</Heading>
          <Text as="p" className="text-mid-grey-00" size="caption">
            {context}
          </Text>

          {estimate.serviceWarning && (
            <div className="border-yellow-00 border-l-4 bg-yellow-10 p-4">
              <Text as="p" size="body">
                <strong>You may not be entitled to a pension.</strong> Workers
                with fewer than 10 years (120 months) of pensionable service who
                leave during that period do not receive a pension. The figures
                below are shown for information only. Contact the PAD to confirm
                your entitlement before making any plans.
              </Text>
            </div>
          )}

          <Heading as="h2">Full pension</Heading>
          <Text as="p" size="body">
            You receive your full pension amount divided by 12 and paid monthly,
            plus a gratuity lump sum. Choose this if you want the highest
            possible monthly income in retirement.
          </Text>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ResultCard
              label="Annual amount"
              tone="teal"
              value={money(estimate.fullAnnual)}
            />
            <ResultCard
              label="Monthly payment"
              tone="teal"
              value={money(estimate.fullMonthly)}
            />
          </div>

          <Heading as="h2">Reduced pension</Heading>
          <Text as="p" size="body">
            You receive 75% of your full pension paid monthly. The remaining 25%
            is converted into a larger gratuity lump sum paid upfront. This may
            suit you if you want more money at the start of retirement — for
            example, to pay off a mortgage or cover immediate costs — and can
            manage on a lower monthly income.
          </Text>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ResultCard
              label="Annual amount"
              tone="teal"
              value={money(estimate.reducedAnnual)}
            />
            <ResultCard
              label="Monthly payment"
              tone="teal"
              value={money(estimate.reducedMonthly)}
            />
          </div>

          <ResultCard
            label="Gratuity (lump sum)"
            tone="green"
            value={money(estimate.gratuity)}
          />

          <div className="mt-4">
            <Heading as="h2">How this estimate is calculated</Heading>
            <Text as="p" size="body">
              Your full annual pension:
            </Text>
            <p className="mt-2 border-blue-40 border-l-4 bg-blue-10 px-4 py-3">
              {monthWord(months)} ÷ 600 × {money(sal)} ={' '}
              {money(estimate.fullAnnual)}
            </p>
            <Text as="p" size="body" className="mt-2">
              <Link href={`${ABOUT_URL}#how-your-pension-is-calculated`}>
                See how the reduced pension and gratuity are calculated
              </Link>
            </Text>
          </div>

          <Text as="p" className="text-mid-grey-00" size="caption">
            These figures are estimates only. Contact the PAD to discuss which
            option suits your circumstances before you retire.
          </Text>

          <div>
            <Button onClick={calculateAgain} type="button" variant="secondary">
              Calculate again
            </Button>
          </div>

          <div className="mt-4 border-grey-00 border-t-2 pt-6">
            <Heading as="h2">Next steps</Heading>
            <Text as="p" size="body">
              Once you have your estimate, contact the National Insurance and
              Social Security Service (NISSS) to discuss your pension options
              and confirm your entitlement.
            </Text>

            <div className="mt-4">
              <Heading as="h3">National Insurance (NIS) Pensions</Heading>
              <Text as="p" size="body">
                NISSS can help you understand your National Insurance Old Age
                Contributory Pension entitlement alongside any government
                pension. If you qualify for both, you will receive only the
                higher of the two.
              </Text>
              <ul className="mt-2 list-disc space-y-2 pl-7">
                <li>
                  Phone: <a href="tel:+12464317400">431-7400</a> — Ext. 1802,
                  1803, 1808 or 1824
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // ---- Form view ----------------------------------------------------------
  return (
    <div className="container pt-4 pb-8 lg:pt-6 lg:pb-12">
      <div className="flex flex-col gap-6 md:w-2/3">
        {errorItems.length > 0 && (
          <ErrorSummary
            errors={errorItems}
            ref={errorSummaryRef}
            title="There is a problem"
          />
        )}
        <ServiceTitle />
        <Heading as="h1">Government Pension calculator</Heading>

        <div className="border-blue-40 border-l-4 bg-blue-10 p-4">
          <Text as="p" size="body">
            <strong>This calculator gives an estimate only.</strong> Your actual
            pension depends on information held by the People Resourcing and
            Compliance Directorate (PRCD) and your last employer. Contact them
            to confirm your exact figures before making any decisions.
          </Text>
        </div>

        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            calculate()
          }}
        >
          <Input
            className="max-w-[8rem]"
            description="The year you began the service that counts towards your pension, for example 2005."
            error={errors.startYear || undefined}
            id="start-year"
            inputMode="numeric"
            label="Year you started pensionable service"
            onInput={(e) => setStartYear(e.currentTarget.value)}
            placeholder="YYYY"
            required
            value={startYear}
          />

          <Input
            className="max-w-[8rem]"
            description="The year your pensionable service ends. If you have not retired yet, use your expected retirement year."
            error={errors.endYear || undefined}
            id="end-year"
            inputMode="numeric"
            label="Year you stopped or will retire"
            onInput={(e) => setEndYear(e.currentTarget.value)}
            placeholder="YYYY"
            required
            value={endYear}
          />

          <Input
            className="max-w-[8rem]"
            description="Total months of no-pay leave you took during your service. These do not count towards your pension and will be subtracted. Leave blank if none."
            error={errors.nopayMonths || undefined}
            id="nopay-months"
            inputMode="numeric"
            label="Months of no-pay leave (optional)"
            onInput={(e) => setNopayMonths(e.currentTarget.value)}
            placeholder="0"
            value={nopayMonths}
          />

          <Input
            className="max-w-[18rem]"
            description="Enter your gross annual salary in Barbados dollars. Do not include commas."
            error={errors.salary || undefined}
            id="salary"
            inputMode="decimal"
            label="Last annual salary (BDS$)"
            onInput={(e) => setSalary(e.currentTarget.value)}
            placeholder="0.00"
            required
            value={salary}
          />

          <div className="flex gap-3">
            <Button
              onClick={() =>
                navigate({
                  to: '/$',
                  params: { _splat: SERVICE_PATH_SPLAT },
                })
              }
              type="button"
              variant="secondary"
            >
              Back
            </Button>
            <Button type="submit">Calculate pension</Button>
          </div>
        </form>

        <div className="mt-4 border-grey-00 border-t-2 pt-6">
          <Text as="p" size="body">
            <Link href={ABOUT_URL}>Learn how your pension is calculated</Link>
          </Text>
        </div>
      </div>
    </div>
  )
}
