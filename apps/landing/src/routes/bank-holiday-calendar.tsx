import { createFileRoute, Link } from '@tanstack/react-router'
import { Heading, Text } from '@govtech-bb/react'
import { useMemo } from 'react'
import { z } from 'zod'
import {
  daysBetween,
  fmtDayNum,
  fmtDayOfWeek,
  fmtFullDate,
  fmtMonthShort,
  fmtSubstituteDate,
  getBankHolidaysForYear,
  MAX_YEAR,
  MIN_YEAR,
  startOfDay,
} from '../lib/bank-holidays'
import type { Holiday } from '../lib/bank-holidays'
import { checkFeatureFlag } from '../lib/feature-flags'

const LAST_UPDATED = '5 May 2026'

const SearchParams = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR).optional(),
})

export const Route = createFileRoute('/bank-holiday-calendar')({
  beforeLoad: async () => {
    await checkFeatureFlag('bank-holiday-calendar')
  },
  validateSearch: SearchParams,
  head: () => ({
    meta: [
      { title: 'Bank holidays | Government of Barbados' },
      {
        name: 'description',
        content:
          'Barbados bank and public holidays, including substitution days under the Public Holidays Act, Cap. 352.',
      },
    ],
  }),
  component: BankHolidaysPage,
})

function BankHolidaysPage() {
  const { year: yearParam } = Route.useSearch()

  const today = useMemo(() => startOfDay(new Date()), [])
  const currentRealYear = today.getUTCFullYear()
  const selectedYear = yearParam ?? currentRealYear

  const holidays = useMemo(
    () => getBankHolidaysForYear(selectedYear),
    [selectedYear],
  )

  const substituteMap = useMemo(() => {
    const map = new Map<string, Holiday>()
    for (const h of holidays) {
      if (h.substitute) {
        const match = h.name.match(/^Public Holiday in lieu of (.+)$/)
        if (match) map.set(match[1], h)
      }
    }
    return map
  }, [holidays])

  const displayHolidays = useMemo(
    () => holidays.filter((h) => !h.substitute),
    [holidays],
  )

  const isCurrentYear = selectedYear === currentRealYear
  const upcoming = isCurrentYear
    ? displayHolidays.filter((h) => h.date >= today)
    : []
  const past = isCurrentYear
    ? displayHolidays.filter((h) => h.date < today)
    : []
  const nextHoliday = upcoming[0]
  const substitutes = holidays.filter((h) => h.substitute)

  return (
    <div className="container">
      <main className="max-w-220 pt-6 pb-16">
        <div className="mb-6 flex flex-col items-center gap-6 lg:mb-10 lg:flex-row lg:justify-between lg:gap-0">
          <div>
            <Heading as="h1" className="mb-xs">
              Bank holidays
            </Heading>
            <Text as="p" className="text-mid-grey-00">
              Last updated on {LAST_UPDATED}
            </Text>
          </div>
          <div className="mt-6 flex w-full justify-end lg:w-auto">
            <YearSwitcher year={selectedYear} />
          </div>
        </div>

        <BankHolidaysPanel
          allHolidays={holidays}
          currentRealYear={currentRealYear}
          displayHolidays={displayHolidays}
          isCurrentYear={isCurrentYear}
          nextHoliday={nextHoliday}
          past={past}
          substituteMap={substituteMap}
          substitutes={substitutes}
          today={today}
          upcoming={upcoming}
          year={selectedYear}
        />

        <AboutSection />
      </main>
    </div>
  )
}

const YEAR_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg border border-grey-00 bg-white px-3.5 py-2 font-semibold text-blue-100 text-sm transition-colors hover:border-blue-100 hover:bg-blue-10'
const YEAR_BUTTON_DISABLED_CLASS =
  'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-grey-00 bg-white px-3.5 py-2 font-semibold text-blue-100 text-sm opacity-50'

function YearSwitcher({ year }: { year: number }) {
  const prevYear = year - 1
  const nextYear = year + 1
  const canGoPrev = year > MIN_YEAR
  const canGoNext = year < MAX_YEAR

  const prevContent = (
    <>
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span className="text-left leading-none">
        <span className="block font-medium text-[11px] text-mid-grey-00 uppercase tracking-wider">
          Previous
        </span>
        <span className="block font-bold text-blue-100 text-sm">
          {prevYear}
        </span>
      </span>
    </>
  )

  const nextContent = (
    <>
      <span className="text-right leading-none">
        <span className="block font-medium text-[11px] text-mid-grey-00 uppercase tracking-wider">
          Next
        </span>
        <span className="block font-bold text-blue-100 text-sm">
          {nextYear}
        </span>
      </span>
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </>
  )

  return (
    <fieldset aria-label="Choose a year" className="flex items-center gap-2">
      {canGoPrev ? (
        <Link
          aria-label={`Previous year, ${prevYear}`}
          className={YEAR_BUTTON_CLASS}
          data-umami-event="bank-holiday-year-prev"
          data-umami-event-year={String(prevYear)}
          replace
          search={{ year: prevYear }}
          to="/bank-holiday-calendar"
        >
          {prevContent}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          aria-label={`Previous year, ${prevYear}`}
          className={YEAR_BUTTON_DISABLED_CLASS}
        >
          {prevContent}
        </span>
      )}
      {canGoNext ? (
        <Link
          aria-label={`Next year, ${nextYear}`}
          className={YEAR_BUTTON_CLASS}
          data-umami-event="bank-holiday-year-next"
          data-umami-event-year={String(nextYear)}
          replace
          search={{ year: nextYear }}
          to="/bank-holiday-calendar"
        >
          {nextContent}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          aria-label={`Next year, ${nextYear}`}
          className={YEAR_BUTTON_DISABLED_CLASS}
        >
          {nextContent}
        </span>
      )}
    </fieldset>
  )
}

interface BankHolidaysPanelProps {
  year: number
  currentRealYear: number
  isCurrentYear: boolean
  displayHolidays: Array<Holiday>
  allHolidays: Array<Holiday>
  upcoming: Array<Holiday>
  past: Array<Holiday>
  nextHoliday: Holiday | undefined
  today: Date
  substitutes: Array<Holiday>
  substituteMap: Map<string, Holiday>
}

function BankHolidaysPanel({
  year,
  currentRealYear,
  isCurrentYear,
  displayHolidays,
  allHolidays,
  upcoming,
  past,
  nextHoliday,
  today,
  substitutes,
  substituteMap,
}: BankHolidaysPanelProps) {
  return (
    <>
      {isCurrentYear && nextHoliday && (
        <NextHolidayHero holiday={nextHoliday} today={today} />
      )}
      {isCurrentYear && !nextHoliday && (
        <YearOverviewHero
          count={allHolidays.length}
          variant="exhausted"
          year={year}
        />
      )}
      {!isCurrentYear && (
        <YearOverviewHero
          count={allHolidays.length}
          variant={year < currentRealYear ? 'past' : 'future'}
          year={year}
        />
      )}

      {isCurrentYear ? (
        <>
          <HolidaySection
            chip={`${upcoming.length} remaining`}
            heading={`Upcoming bank holidays ${year}`}
            highlightFirst
            holidays={upcoming}
            substituteMap={substituteMap}
          />
          {past.length > 0 && (
            <HolidaySection
              chip={`${past.length} so far`}
              heading={`Past bank holidays ${year}`}
              holidays={past}
              muted
              substituteMap={substituteMap}
            />
          )}
        </>
      ) : (
        <HolidaySection
          chip={`${displayHolidays.length} ${
            year < currentRealYear ? 'observed' : 'scheduled'
          }`}
          heading={`All bank holidays ${year}`}
          holidays={displayHolidays}
          substituteMap={substituteMap}
        />
      )}
      <div className="mt-10 flex justify-end">
        <YearSwitcher year={year} />
      </div>
      <SubstitutionNotice substituteCount={substitutes.length} year={year} />
    </>
  )
}

function NextHolidayHero({
  holiday,
  today,
}: {
  holiday: Holiday
  today: Date
}) {
  const days = daysBetween(today, holiday.date)
  const countdownLabel =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days away`

  return (
    <section
      aria-label="Next bank holiday"
      className="relative mb-8 overflow-hidden rounded-lg bg-blue-100 px-8 pt-7 pb-8 text-white"
    >
      <div className="relative">
        <span className="mb-6 inline-flex items-center rounded-lg bg-yellow-100 px-3.5 py-1.5 font-extrabold text-blue-100 text-xs uppercase tracking-widest">
          Next bank holiday
        </span>
        <h2 className="mb-2.5 font-extrabold text-4xl leading-tight tracking-tight">
          {holiday.name}
        </h2>
        <p className="mb-6 font-bold text-xl text-yellow-00 tracking-tight">
          {fmtFullDate(holiday.date)}
        </p>
        <p className="font-medium text-[15px] text-white/70">
          {days === 0 || days === 1 ? (
            <strong className="font-bold text-base text-yellow-00">
              {countdownLabel}
            </strong>
          ) : (
            <>
              <strong className="font-bold text-base text-yellow-00">
                {days}
              </strong>{' '}
              days away
            </>
          )}
        </p>
      </div>
    </section>
  )
}

function YearOverviewHero({
  year,
  variant,
  count,
}: {
  year: number
  variant: 'past' | 'future' | 'exhausted'
  count: number
}) {
  const labels: Record<typeof variant, { pill: string; heading: string }> = {
    past: {
      pill: 'Past year',
      heading: `${count} bank holidays were observed in ${year}`,
    },
    future: {
      pill: 'Future year',
      heading: `${count} bank holidays will be observed in ${year}`,
    },
    exhausted: {
      pill: `No more holidays in ${year}`,
      heading: `All ${year} bank holidays have passed`,
    },
  }
  const { pill, heading } = labels[variant]

  return (
    <section
      aria-label="Year overview"
      className="mb-8 rounded-lg border border-grey-00 bg-[#f5f7fa] px-8 py-6"
    >
      <span className="mb-3 inline-block rounded-lg bg-grey-00 px-3 py-1 font-bold text-mid-grey-00 text-xs uppercase tracking-wider">
        {pill}
      </span>
      <h2 className="font-extrabold text-2xl text-blue-100 leading-tight tracking-tight">
        {heading}
      </h2>
    </section>
  )
}

function HolidaySection({
  heading,
  chip,
  holidays,
  highlightFirst,
  muted,
  substituteMap,
}: {
  heading: string
  chip: string
  holidays: Array<Holiday>
  highlightFirst?: boolean
  muted?: boolean
  substituteMap: Map<string, Holiday>
}) {
  if (holidays.length === 0) return null

  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-extrabold text-2xl text-blue-100 tracking-tight">
          {heading}
        </h2>
        <span className="inline-flex items-center rounded-lg bg-grey-00 px-3 py-1 font-medium text-mid-grey-00 text-xs">
          {chip}
        </span>
      </div>

      <div className="border-grey-00 border-t">
        <div
          aria-hidden="true"
          className="hidden border-grey-00 border-b-2 px-4 pt-2 pb-2.5 font-bold text-mid-grey-00 text-xs uppercase tracking-wider md:grid md:grid-cols-[72px_1fr_130px] md:gap-6"
        >
          <span>Date</span>
          <span>Holiday</span>
          <span className="text-right">Day</span>
        </div>

        <ul>
          {holidays.map((h, i) => (
            <HolidayRow
              holiday={h}
              isNext={Boolean(highlightFirst && i === 0)}
              key={`${h.date.toISOString()}-${h.name}`}
              muted={muted}
              substitute={substituteMap.get(h.name)}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function HolidayRow({
  holiday,
  isNext,
  muted,
  substitute,
}: {
  holiday: Holiday
  isNext?: boolean
  muted?: boolean
  substitute?: Holiday
}) {
  return (
    <li
      className={[
        'grid grid-cols-[64px_1fr] items-center gap-3.5 border-grey-00 border-b px-2 py-4 md:grid-cols-[72px_1fr_130px] md:gap-6 md:px-4 md:py-4.5',
        isNext
          ? '-mt-px mb-2 rounded-lg border border-yellow-100 bg-yellow-10 md:px-4'
          : '',
      ].join(' ')}
    >
      <div
        aria-hidden="true"
        className={[
          'rounded-lg text-center font-extrabold leading-none',
          muted ? 'bg-grey-00 text-mid-grey-00' : 'bg-yellow-100 text-blue-100',
        ].join(' ')}
      >
        <span className="block px-1 pt-2 pb-1 text-[11px] uppercase tracking-wider">
          {fmtMonthShort(holiday.date)}
        </span>
        <span className="block px-1 pb-2.5 text-2xl tracking-tight">
          {fmtDayNum(holiday.date)}
        </span>
      </div>
      <div>
        <span
          className={[
            'block font-bold text-base leading-snug',
            muted ? 'text-mid-grey-00' : 'text-blue-100',
          ].join(' ')}
        >
          {holiday.name}
        </span>
        {holiday.note && (
          <span className="mt-0.5 block text-mid-grey-00 text-sm leading-snug">
            {holiday.note}
          </span>
        )}
        {substitute && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-yellow-100 bg-yellow-10 px-2 py-0.5 font-semibold text-blue-100 text-xs">
            Observed: {fmtSubstituteDate(substitute.date)}
          </span>
        )}
      </div>
      <div
        className={[
          'col-span-2 mt-[-8px] pl-[78px] font-medium text-[13px] md:col-span-1 md:mt-0 md:pl-0 md:text-right md:text-[15px]',
          muted ? 'text-mid-grey-00' : 'text-mid-grey-00',
        ].join(' ')}
      >
        {fmtDayOfWeek(holiday.date)}
      </div>
    </li>
  )
}

function SubstitutionNotice({
  year,
  substituteCount,
}: {
  year: number
  substituteCount: number
}) {
  const subText =
    substituteCount === 0
      ? `No substitute days apply for ${year}.`
      : `${substituteCount} substitute day${substituteCount > 1 ? 's' : ''} appl${
          substituteCount === 1 ? 'ies' : 'y'
        } for ${year}.`

  return (
    <div className="mt-10 rounded-lg border-blue-100 border-l-4 bg-blue-10 px-5 py-4 text-[15px] text-mid-grey-00">
      <strong className="mb-1 block text-base text-blue-100">
        When a bank holiday falls on a weekend
      </strong>
      Most holidays falling on a Sunday are observed on the following Monday.{' '}
      <span className="text-mid-grey-00">{subText}</span>
      <details className="mt-1.5" open>
        <summary className="cursor-pointer font-semibold text-blue-100">
          Read the full rules
        </summary>
        <p className="mt-2.5 text-sm">
          If New Year&apos;s Day, Errol Barrow Day, National Heroes Day, Labour
          Day, Independence Day or Boxing Day falls on a Sunday, the following
          Monday is observed as a public holiday in lieu.
        </p>
        <p className="mt-2 text-sm">
          If Emancipation Day (1 August) falls on a Sunday or Monday, the
          following Tuesday is also a public holiday. The same applies to
          Christmas Day.
        </p>
      </details>
    </div>
  )
}

function AboutSection() {
  return (
    <section
      aria-labelledby="about-heading"
      className="mt-16 border-grey-00 border-t-2 pt-8"
    >
      <h2
        className="mb-3 font-extrabold text-blue-100 text-xl"
        id="about-heading"
      >
        About this list
      </h2>
      <p className="mb-3 max-w-[640px] text-[15px] text-mid-grey-00">
        Bank holidays in Barbados are set out in the Public Holidays Act, Cap.
        352. The Government may also declare additional one-off public holidays
        from time to time.
      </p>
      <p className="mb-3 max-w-[640px] text-[15px] text-mid-grey-00">
        This page is updated when new dates are gazetted.
      </p>
      <p className="max-w-[640px] text-[15px] text-mid-grey-00">
        <strong className="text-blue-100">Source:</strong> Public Holidays Act,
        Cap. 352 — Government of Barbados Ministry of Labour.{' '}
        <a
          className="text-blue-100 underline hover:text-blue-100/80"
          href="https://labour.gov.bb/library/library-publications/holidays/"
          rel="noopener noreferrer"
          target="_blank"
        >
          View official list at labour.gov.bb
        </a>
        .
      </p>
    </section>
  )
}
