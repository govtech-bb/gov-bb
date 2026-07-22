import { Button, ErrorSummary, Link, linkVariants } from '@govtech-bb/react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import {
  earningsAtRisk,
  estimateBenefits,
  monthlyAverage,
  NIS,
  suggestedContributions,
  Tier,
} from '../-lib/compute'
import type { EarningsInputs } from '../-lib/compute'

type Screen =
  | 'hero'
  | 'benefits'
  | 'income'
  | 'plan'
  | 'result'
  | 'next-steps'
  | 'register-path'

const SERVICE_PATH_SPLAT =
  'money-financial-support/national-insurance-for-self-employed-workers'
const HOWTO_HREF = `/${SERVICE_PATH_SPLAT}/how-to-get-your-benefits`
const SERVICE_CAPTION = 'NISSS for self-employed and gig workers'

// The prototype's soft card shadow (no design token for it).
const CARD =
  'rounded-2xl border border-grey-00 bg-white-00 shadow-[0_1px_2px_rgba(0,22,74,0.04),0_4px_14px_rgba(0,22,74,0.06)]'

// Currency formatting in line with the sibling money-financial-support tools
// (calculate-severance-pay, calculate-your-pension).
const moneyFmt = new Intl.NumberFormat('en-BB', {
  style: 'currency',
  currency: 'BBD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const money = (n: number) => moneyFmt.format(n || 0)

function PerWeek({ weekly }: { weekly: number }) {
  return (
    <>
      <strong className="tabular-nums">{money(weekly)}</strong> a week{' '}
      <span className="text-mid-grey-00">
        (about {money((weekly * 52) / 12)}/month)
      </span>
    </>
  )
}

/* ── Icons: the prototype's Lucide paths, rendered inline (decorative) ── */
const ICONS: Record<string, string> = {
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  sickness:
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  maternity:
    '<path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M15 12h.01"/><path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/><path d="M9 12h.01"/>',
  paternity:
    '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  invalidity:
    '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>',
  survivors:
    '<path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"/>',
  pension:
    '<path d="M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z"/><path d="M16 10h.01"/><path d="M2 8v1a2 2 0 0 0 2 2h1"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  phone:
    '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
}

function Icon({
  name,
  className,
  strokeWidth = 1.75,
}: {
  name: string
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    />
  )
}

type Tone = 'teal' | 'pink' | 'blue' | 'purple' | 'yellow' | 'green'
const TONE: Record<
  Tone,
  { bg: string; text: string; border: string; fill: string }
> = {
  teal: {
    bg: 'bg-teal-10',
    text: 'text-teal-00',
    border: 'border-teal-40',
    fill: 'bg-teal-00',
  },
  pink: {
    bg: 'bg-pink-10',
    text: 'text-pink-00',
    border: 'border-pink-40',
    fill: 'bg-pink-00',
  },
  blue: {
    bg: 'bg-blue-10',
    text: 'text-blue-100',
    border: 'border-blue-40',
    fill: 'bg-blue-100',
  },
  purple: {
    bg: 'bg-purple-10',
    text: 'text-purple-00',
    border: 'border-purple-40',
    fill: 'bg-purple-00',
  },
  yellow: {
    bg: 'bg-yellow-10',
    text: 'text-yellow-00',
    border: 'border-yellow-40',
    fill: 'bg-yellow-00',
  },
  green: {
    bg: 'bg-green-10',
    text: 'text-green-00',
    border: 'border-green-40',
    fill: 'bg-green-00',
  },
}

/* ── Shared bits ────────────────────────────────────────────────────── */

// Roving-tabindex + arrow-key behaviour for the custom `role="radio"` groups,
// mirroring the design system's RadioGroup: one tab stop (the selected option,
// or the first when none is chosen), and Arrow/Home/End move focus and select.
function rovingRadioProps<T>(
  items: Array<T>,
  domId: (item: T) => string,
  selectedIndex: number,
  onSelect: (index: number) => void,
): Array<{ tabIndex: number; onKeyDown: (e: KeyboardEvent) => void }> {
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex
  return items.map((_, idx) => ({
    tabIndex: idx === tabStop ? 0 : -1,
    onKeyDown: (e: KeyboardEvent) => {
      const n = items.length
      let next: number | null = null
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % n
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
        next = (idx - 1 + n) % n
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = n - 1
      if (next === null) return
      e.preventDefault()
      onSelect(next)
      document.getElementById(domId(items[next]))?.focus()
    },
  }))
}

function ServiceCaption() {
  return (
    <p className="mb-2 border-blue-40 border-l-4 py-2 pl-4 text-[1rem] text-mid-grey-00">
      {SERVICE_CAPTION}
    </p>
  )
}

function IconCircle({
  name,
  tone,
  tint,
}: {
  name: string
  tone: Tone
  tint?: boolean
}) {
  return (
    <span
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        tint ? TONE[tone].bg : 'bg-white-00'
      } ${TONE[tone].text}`}
    >
      <Icon className="h-6 w-6" name={name} />
    </span>
  )
}

export function CoverageCalculator() {
  const [screen, setScreen] = useState<Screen>('hero')
  const [registerFrom, setRegisterFrom] = useState<Screen>('hero')

  const [goodMonth, setGoodMonth] = useState('')
  const [slowMonth, setSlowMonth] = useState('')
  const [goodMonths, setGoodMonths] = useState('')
  const [errors, setErrors] = useState<{
    goodMonth?: string
    slowMonth?: string
    goodMonths?: string
  }>({})
  const [tier, setTier] = useState<Tier | ''>('')
  const [tierError, setTierError] = useState('')
  const [alreadyHasNis, setAlreadyHasNis] = useState<
    'yes' | 'no' | 'unsure' | ''
  >('')

  const topRef = useRef<HTMLDivElement>(null)
  const incomeErrorRef = useRef<HTMLDivElement>(null)
  const planErrorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
    topRef.current?.focus()
  }, [screen])

  // Move focus to (and scroll to) an error summary when validation fails on a
  // step that stays on the same screen — mirrors the sibling calculators.
  const focusErrorSummary = (ref: RefObject<HTMLDivElement | null>) => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const go = (next: Screen) => setScreen(next)

  const goodMonthNum = Number.parseFloat(goodMonth.replace(/,/g, '').trim())
  const slowMonthNum = Number.parseFloat(slowMonth.replace(/,/g, '').trim())
  const goodMonthsNum = Number.parseInt(goodMonths.trim(), 10)

  const earnings: EarningsInputs = {
    goodMonth: Number.isFinite(goodMonthNum) ? goodMonthNum : 0,
    slowMonth: Number.isFinite(slowMonthNum) ? slowMonthNum : 0,
    goodMonthsPerYear: Number.isFinite(goodMonthsNum) ? goodMonthsNum : 0,
  }

  function submitIncome() {
    const next: typeof errors = {}
    if (!goodMonth.trim())
      next.goodMonth = 'Enter your earnings in a good month'
    else if (!Number.isFinite(goodMonthNum) || goodMonthNum <= 0)
      next.goodMonth = 'Good month earnings must be an amount greater than 0'
    if (!slowMonth.trim())
      next.slowMonth = 'Enter your earnings in a slow month'
    else if (!Number.isFinite(slowMonthNum) || slowMonthNum < 0)
      next.slowMonth = 'Slow month earnings must be 0 or more'
    if (!goodMonths.trim())
      next.goodMonths = 'Enter how many good months you have in a year'
    else if (
      !/^\d+$/.test(goodMonths.trim()) ||
      goodMonthsNum < 1 ||
      goodMonthsNum > 12
    )
      next.goodMonths = 'Enter a whole number of good months from 1 to 12'
    setErrors(next)
    if (Object.keys(next).length === 0) {
      setTierError('')
      go('plan')
    } else {
      focusErrorSummary(incomeErrorRef)
    }
  }

  function restart() {
    setGoodMonth('')
    setSlowMonth('')
    setGoodMonths('')
    setErrors({})
    setTier('')
    setTierError('')
    setAlreadyHasNis('')
    go('hero')
  }

  return (
    <div className="container pt-4 pb-10 lg:py-8">
      <article
        className="mx-auto w-full max-w-3xl outline-none"
        ref={topRef}
        tabIndex={-1}
      >
        {screen === 'hero' && (
          <Hero
            onBenefits={() => go('benefits')}
            onRegister={() => {
              setRegisterFrom('hero')
              go('register-path')
            }}
            onStart={() => go('income')}
          />
        )}

        {screen === 'benefits' && <BenefitsQuick onBack={() => go('hero')} />}

        {screen === 'income' && (
          <IncomeStep
            errorRef={incomeErrorRef}
            errors={errors}
            goodMonth={goodMonth}
            goodMonths={goodMonths}
            onBack={() => go('hero')}
            onContinue={submitIncome}
            setGoodMonth={setGoodMonth}
            setGoodMonths={setGoodMonths}
            setSlowMonth={setSlowMonth}
            slowMonth={slowMonth}
          />
        )}

        {screen === 'plan' && (
          <PlanStep
            earnings={earnings}
            error={tierError}
            errorRef={planErrorRef}
            onBack={() => go('income')}
            onContinue={() => {
              if (!tier) {
                setTierError('Select a contribution level')
                focusErrorSummary(planErrorRef)
                return
              }
              setTierError('')
              go('result')
            }}
            setTier={(t) => {
              setTier(t)
              setTierError('')
            }}
            tier={tier}
          />
        )}

        {screen === 'result' && tier && (
          <ResultStep
            earnings={earnings}
            onBack={() => go('plan')}
            onNext={() => go('next-steps')}
            tier={tier}
          />
        )}

        {screen === 'next-steps' && (
          <NextSteps
            onBack={() => go('result')}
            onRegister={() => {
              setRegisterFrom('next-steps')
              go('register-path')
            }}
            onRestart={restart}
          />
        )}

        {screen === 'register-path' && (
          <RegisterPath
            onBack={() => go(registerFrom)}
            selected={alreadyHasNis}
            setSelected={setAlreadyHasNis}
          />
        )}
      </article>
    </div>
  )
}

/* ── Screen: hero ───────────────────────────────────────────────────── */
const HELPS: Array<[string, string]> = [
  ['sickness', 'Money to live on if you get sick'],
  ['maternity', 'Income when you have a baby'],
  ['invalidity', 'Support if a long illness stops you working'],
  ['pension', 'A pension when you retire'],
  ['survivors', 'Help for your family if something happens'],
]

function Hero({
  onBenefits,
  onRegister,
  onStart,
}: {
  onBenefits: () => void
  onRegister: () => void
  onStart: () => void
}) {
  return (
    <div>
      <div
        className="-mx-4 -mt-4 rounded-b-3xl px-4 pt-6 pb-8 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-6 sm:pt-4"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(48,192,200,0.18), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,199,38,0.22), transparent 40%)',
        }}
      >
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-10 px-3 py-1.5 font-medium text-[0.95rem] text-teal-00">
          <Icon className="h-4 w-4" name="shield" />
          From NISSS Barbados
        </span>
        <h1 className="mb-4 font-bold text-[2.75rem] text-black-00 leading-[1.1] tracking-tight sm:text-[3.5rem]">
          Protect your income.
          <br />
          <span className="text-teal-00">Protect your future.</span>
        </h1>
        <p className="mb-6 text-[1.125rem] text-mid-grey-00">
          You work for yourself: driving, delivering, freelancing, building,
          selling, creating. NISSS is how you look after yourself when life
          happens.
        </p>
        <div className="flex flex-col items-stretch gap-3 [&_button]:w-full [&_button]:justify-center">
          <Button onClick={onStart} type="button">
            Estimate my contributions
          </Button>
          <Button onClick={onBenefits} type="button" variant="secondary">
            See what you may qualify for
          </Button>
          <button
            className={`${linkVariants()} py-2 text-center`}
            onClick={onRegister}
            type="button"
          >
            I&rsquo;m ready to register for NISSS
          </button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-bold text-[1.5rem] text-black-00">
          What is NISSS, simply?
        </h2>
        <p className="mb-4 text-[1.125rem] text-mid-grey-00">
          NISSS stands for the{' '}
          <strong className="text-black-00">
            National Insurance and Social Security Scheme
          </strong>{' '}
          (formerly known as NIS). Think of it as a safety net you build up bit
          by bit. You put in a small amount when you earn. It&rsquo;s there when
          you need it: when you&rsquo;re sick, when you have a baby, when you
          retire.
        </p>
        <p className="mb-6 text-[1.125rem] text-mid-grey-00">
          Self-employed Bajans can join too. You choose how much you put in:{' '}
          <strong className="text-black-00">
            more in good months, less in slow ones
          </strong>
          . It&rsquo;s voluntary, and what matters is your total over the year.
        </p>

        <div className="mb-6 rounded-2xl border border-blue-10 bg-blue-10/40 p-5">
          <p className="mb-3 font-semibold text-black-00">
            What NISSS can help with
          </p>
          <ul className="flex flex-col gap-2.5">
            {HELPS.map(([icon, text]) => (
              <li className="flex items-start gap-3" key={icon}>
                <span className="mt-0.5 text-teal-00">
                  <Icon className="h-6 w-6" name={icon} />
                </span>
                <span className="text-[1.25rem] text-black-00">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          className="inline-flex items-center gap-1.5 font-medium text-[1rem] text-teal-00 underline underline-offset-2 hover:no-underline"
          onClick={onBenefits}
          type="button"
        >
          Learn more about each one
          <Icon className="h-5 w-5" name="arrowRight" strokeWidth={2} />
        </button>
      </div>

      <p className="mt-8 flex items-center gap-2 border-grey-00 border-t pt-6 text-[1rem] text-mid-grey-00">
        <Icon className="h-4 w-4 shrink-0" name="lock" />
        This is a guide only. Nothing you enter here is saved or shared.
      </p>
    </div>
  )
}

/* ── Screen: benefits quick reference ───────────────────────────────── */
const BENEFITS: Array<{
  icon: string
  tone: Tone
  title: string
  desc: string
}> = [
  {
    icon: 'sickness',
    tone: 'teal',
    title: 'Sickness Benefit',
    desc: 'If you cannot work because you are unwell, you still get money to live on.',
  },
  {
    icon: 'maternity',
    tone: 'pink',
    title: 'Maternity Benefit',
    desc: 'Income while you take time off to have your baby, so you can rest and recover.',
  },
  {
    icon: 'paternity',
    tone: 'blue',
    title: 'Paternity Benefit',
    desc: 'A short paid break for new fathers to be with their family.',
  },
  {
    icon: 'invalidity',
    tone: 'purple',
    title: 'Invalidity Pension',
    desc: 'If a long illness or accident stops you from working, you get ongoing support.',
  },
  {
    icon: 'survivors',
    tone: 'yellow',
    title: "Survivors' Benefit",
    desc: 'If something happens to you, your partner, children, or parents get help.',
  },
  {
    icon: 'pension',
    tone: 'green',
    title: 'Old-Age Contributory Pension',
    desc: 'A monthly income when you stop working, built up over the years from what you put in.',
  },
]

function BenefitsQuick({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        Six ways NISSS protects you.
      </h1>
      <p className="mb-6 text-[1.125rem] text-mid-grey-00">
        Quick read: about a minute.
      </p>
      <div className="flex flex-col gap-3">
        {BENEFITS.map((b) => (
          <div
            className={`rounded-2xl border ${TONE[b.tone].border} ${TONE[b.tone].bg} p-4`}
            key={b.title}
          >
            <div className="flex items-start gap-3">
              <IconCircle name={b.icon} tone={b.tone} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[1.2rem] text-black-00">
                  {b.title}
                </p>
                <p className="mt-1 text-[1.05rem] text-black-00">{b.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
      </div>
    </div>
  )
}

/* ── Screen: earnings ───────────────────────────────────────────────── */
function MoneyField({
  error,
  hint,
  id,
  label,
  onChange,
  prefix,
  value,
}: {
  error?: string
  hint: string
  id: string
  label: string
  onChange: (v: string) => void
  prefix?: string
  value: string
}) {
  return (
    <div className={`${CARD} p-5`}>
      <label
        className="block font-semibold text-[1.25rem] text-black-00"
        htmlFor={id}
      >
        {label}
      </label>
      <p className="mt-1 mb-3 text-[1rem] text-mid-grey-00" id={`${id}-hint`}>
        {hint}
      </p>
      <div
        className={`inline-flex max-w-[16rem] items-center rounded-sm border-2 bg-white-00 transition-all focus-within:ring-4 focus-within:ring-teal-100 ${
          error ? 'border-red-00' : 'border-black-00'
        }`}
      >
        {prefix && <span className="pl-3 text-mid-grey-00">{prefix}</span>}
        <input
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? 'true' : undefined}
          className="w-full min-w-0 rounded-[inherit] bg-transparent p-3 text-[1.125rem] tabular-nums outline-none"
          id={id}
          inputMode="numeric"
          onInput={(e) => onChange(e.currentTarget.value)}
          type="text"
          value={value}
        />
      </div>
      {error && (
        <p className="mt-2 text-[1rem] text-red-00" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function IncomeStep({
  errorRef,
  errors,
  goodMonth,
  goodMonths,
  onBack,
  onContinue,
  setGoodMonth,
  setGoodMonths,
  setSlowMonth,
  slowMonth,
}: {
  errorRef: RefObject<HTMLDivElement | null>
  errors: { goodMonth?: string; slowMonth?: string; goodMonths?: string }
  goodMonth: string
  goodMonths: string
  onBack: () => void
  onContinue: () => void
  setGoodMonth: (v: string) => void
  setGoodMonths: (v: string) => void
  setSlowMonth: (v: string) => void
  slowMonth: string
}) {
  const errorItems = [
    errors.goodMonth && { text: errors.goodMonth, target: 'good-month' },
    errors.slowMonth && { text: errors.slowMonth, target: 'slow-month' },
    errors.goodMonths && { text: errors.goodMonths, target: 'good-months' },
  ].filter(Boolean) as Array<{ text: string; target: string }>
  return (
    <div>
      {errorItems.length > 0 && (
        <div className="mb-6">
          <ErrorSummary
            errors={errorItems}
            ref={errorRef}
            title="There is a problem"
          />
        </div>
      )}
      <ServiceCaption />
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        Let&rsquo;s talk about your earnings.
      </h1>
      <p className="mb-6 text-[1.125rem] text-mid-grey-00">
        Be honest. There are no wrong answers, and this stays on your phone. We
        use it to give you a real estimate that fits your life.
      </p>

      <div className="flex flex-col gap-4">
        <MoneyField
          error={errors.goodMonth}
          hint="When work is steady and money comes in. A rough number is fine."
          id="good-month"
          label="What does a good month look like?"
          onChange={setGoodMonth}
          prefix="$"
          value={goodMonth}
        />
        <MoneyField
          error={errors.slowMonth}
          hint="When work is quiet: slow season, hurricane month, sickness. A rough number is fine."
          id="slow-month"
          label="And a slow month?"
          onChange={setSlowMonth}
          prefix="$"
          value={slowMonth}
        />
        <MoneyField
          error={errors.goodMonths}
          hint="Enter a number from 1 to 12."
          id="good-months"
          label="How many good months do you usually have in a year?"
          onChange={setGoodMonths}
          value={goodMonths}
        />
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
        <Button onClick={onContinue} type="button">
          Continue
        </Button>
      </div>
    </div>
  )
}

/* ── Screen: plan ───────────────────────────────────────────────────── */
const TIERS: Array<{
  id: Tier
  label: string
  tone: Tone
  recommended?: boolean
  sub: string
}> = [
  {
    id: Tier.Minimum,
    label: 'Minimum',
    tone: 'yellow',
    sub: 'Smaller payouts, but every benefit still counts.',
  },
  {
    id: Tier.Moderate,
    label: 'Moderate',
    tone: 'green',
    recommended: true,
    sub: 'A bigger share of your earnings.',
  },
  {
    id: Tier.Stronger,
    label: 'Stronger',
    tone: 'teal',
    sub: 'The strongest cover you can build.',
  },
]

function PlanStep({
  earnings,
  error,
  errorRef,
  onBack,
  onContinue,
  setTier,
  tier,
}: {
  earnings: EarningsInputs
  error: string
  errorRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  onContinue: () => void
  setTier: (t: Tier) => void
  tier: Tier | ''
}) {
  const suggested = suggestedContributions(earnings)
  const monthlyAvg = monthlyAverage(earnings)
  const chosen = tier ? suggested[tier] : null
  const selTier = TIERS.find((t) => t.id === tier)
  const tierRadio = rovingRadioProps(
    TIERS,
    (t) => `tier-${t.id}`,
    TIERS.findIndex((t) => t.id === tier),
    (i) => setTier(TIERS[i].id),
  )

  return (
    <div>
      {error && (
        <div className="mb-6">
          <ErrorSummary
            errors={[{ text: error, target: 'tier-minimum' }]}
            ref={errorRef}
            title="There is a problem"
          />
        </div>
      )}
      <ServiceCaption />
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        What should you put in?
      </h1>
      <p className="mb-1 text-[1.125rem] text-mid-grey-00">
        Pick a level you can afford. The more you put in, the bigger your
        benefits. You&rsquo;ll see what each one protects next.
      </p>
      <p className="mb-5 text-[1.125rem] text-mid-grey-00">
        We&rsquo;ve suggested these levels from your average earnings of about{' '}
        <strong className="text-black-00 tabular-nums">
          {money(monthlyAvg)}
        </strong>{' '}
        a month.
      </p>

      <div className={error ? 'border-red-00 border-l-4 pl-4' : ''}>
        {error && (
          <p
            className="mb-2 font-semibold text-[1rem] text-red-00"
            id="tier-error"
          >
            {error}
          </p>
        )}
        <div
          aria-describedby={error ? 'tier-error' : undefined}
          aria-label="Contribution level"
          className="flex flex-col gap-3"
          role="radiogroup"
        >
          {TIERS.map((t, i) => {
            const selected = tier === t.id
            const tone = TONE[t.tone]
            return (
              <button
                aria-checked={selected}
                className={`rounded-xl border-2 ${tone.bg} ${
                  selected
                    ? `${tone.border} shadow-[inset_0_0_0_2px] `
                    : tone.border
                } p-4 text-left transition-shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                  selected ? tone.text : ''
                }`}
                id={`tier-${t.id}`}
                key={t.id}
                onClick={() => setTier(t.id)}
                onKeyDown={tierRadio[i].onKeyDown}
                role="radio"
                tabIndex={tierRadio[i].tabIndex}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-black-00">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[1.25rem]">{t.label}</p>
                      {t.recommended && (
                        <span
                          className={`rounded-full border bg-white-00 ${tone.border} ${tone.text} px-2.5 py-1 font-semibold text-[0.85rem]`}
                        >
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-bold text-[2rem] tabular-nums leading-none">
                      {money(suggested[t.id])}
                      <span className="font-normal text-[1rem] text-mid-grey-00">
                        {' '}
                        /month
                      </span>
                    </p>
                    <p className="mt-2 text-[1rem] text-mid-grey-00">{t.sub}</p>
                  </div>
                  <span
                    className={`mt-1 inline-flex h-6 w-6 shrink-0 rounded-full ${
                      selected
                        ? `${tone.fill} shadow-[0_0_0_3px_#fff]`
                        : 'border-2 border-mid-grey-00'
                    }`}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {chosen !== null && selTier && (
        <div
          className="mt-6 rounded-3xl p-6 text-white-00"
          style={{
            backgroundImage:
              'linear-gradient(to bottom right, var(--color-teal-00), var(--color-blue-100))',
          }}
        >
          <div className="mb-1 flex items-start justify-between gap-3">
            <p className="font-semibold text-[0.95rem] text-teal-40 uppercase tracking-wide">
              Your plan
            </p>
            <span
              className={`inline-flex items-center rounded-full ${TONE[selTier.tone].bg} ${TONE[selTier.tone].text} px-4 py-1.5 font-bold text-[1.05rem]`}
            >
              {selTier.label}
            </span>
          </div>
          <p className="mb-1 font-bold text-[2rem] tabular-nums leading-tight">
            {money(chosen)}
            <span className="font-normal text-[1rem] text-teal-40">
              {' '}
              / month
            </span>
          </p>
          <p className="text-[1rem] text-white-00/90">
            About <strong className="tabular-nums">{money(chosen / 4)}</strong>{' '}
            a week.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 border-white-00/20 border-t pt-4">
            <div>
              <p className="text-[0.95rem] text-teal-40 uppercase tracking-wide">
                In a year
              </p>
              <p className="font-bold text-[1.3rem] tabular-nums">
                {money(chosen * 12)}
              </p>
            </div>
            <div>
              <p className="text-[0.95rem] text-teal-40 uppercase tracking-wide">
                In 10 years
              </p>
              <p className="font-bold text-[1.3rem] tabular-nums">
                {money(chosen * 12 * 10)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2 border-blue-40 border-l-4 bg-grey-00/50 p-4 text-[1rem] text-black-00">
        <p>
          <strong>Good month?</strong> Pay a bit more.{' '}
          <strong>Slow month?</strong> Pay less, or skip it. What matters is
          your total for the year.
        </p>
        <p>
          <strong>Benefits start</strong> after one full year of contributions
          (at least {money(NIS.MIN_ANNUAL_CONTRIBUTION)}).
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
        <Button onClick={onContinue} type="button">
          See what this protects
        </Button>
      </div>
    </div>
  )
}

/* ── Screen: result ─────────────────────────────────────────────────── */
function BenefitCard({
  defaultOpen,
  icon,
  title,
  tone,
  without,
  withNis,
}: {
  defaultOpen?: boolean
  icon: string
  title: string
  tone: Tone
  without: ReactNode
  withNis: ReactNode
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border border-grey-00 bg-white-00"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <IconCircle name={icon} tint tone={tone} />
        <span className="min-w-0 flex-1 font-semibold text-[1.25rem] text-black-00">
          {title}
        </span>
        <Icon
          className="h-6 w-6 shrink-0 text-black-00 transition-transform group-open:rotate-180"
          name="chevronDown"
          strokeWidth={2.25}
        />
      </summary>
      <div className="flex flex-col gap-3 border-grey-00 border-t px-4 pt-4 pb-5">
        <div className="rounded-lg border border-red-40/60 bg-red-10 p-3">
          <p className="mb-1 font-semibold text-[0.95rem] text-red-00 uppercase tracking-wide">
            Without NISSS
          </p>
          <p className="text-[1.125rem] text-black-00">{without}</p>
        </div>
        <div className="rounded-lg border border-green-40 bg-green-10 p-3">
          <p className="mb-1 font-semibold text-[0.95rem] text-green-00 uppercase tracking-wide">
            With NISSS
          </p>
          <p className="text-[1.125rem] text-black-00">{withNis}</p>
        </div>
      </div>
    </details>
  )
}

function ResultStep({
  earnings,
  onBack,
  onNext,
  tier,
}: {
  earnings: EarningsInputs
  onBack: () => void
  onNext: () => void
  tier: Tier
}) {
  const b = estimateBenefits(earnings, tier)
  const risk = earningsAtRisk(earnings)

  const items: Array<{
    icon: string
    title: string
    tone: Tone
    without: ReactNode
    withNis: ReactNode
  }> = [
    {
      icon: 'sickness',
      title: 'Sickness Benefit',
      tone: 'teal',
      without: (
        <>
          Two weeks off sick is about{' '}
          <strong>{money(risk.twoWeeksLost)}</strong> you couldn&rsquo;t earn —
          rent, food and bills still due.
        </>
      ),
      withNis: (
        <>
          Sickness Benefit pays about <PerWeek weekly={b.sicknessWeekly} />,
          roughly two-thirds of your usual earnings, for up to{' '}
          {NIS.SICKNESS_MAX_WEEKS} weeks. If you&rsquo;re still unwell after
          that, NISSS may pay for up to {NIS.SICKNESS_MAX_WEEKS} more weeks.
        </>
      ),
    },
    {
      icon: 'maternity',
      title: 'Maternity Benefit',
      tone: 'pink',
      without:
        'Time off to have your baby means no money coming in. Many parents go back to work too soon.',
      withNis: (
        <>
          Maternity Benefit pays about <PerWeek weekly={b.maternityWeekly} />,
          based on your earnings, for your time off.
        </>
      ),
    },
    {
      icon: 'paternity',
      title: 'Paternity Benefit',
      tone: 'blue',
      without:
        'Taking time with a new baby usually means unpaid days away from work.',
      withNis: (
        <>
          Paternity Benefit gives new fathers a {NIS.PATERNITY_WEEKS}-week paid
          break of about <PerWeek weekly={b.paternityWeekly} />.
        </>
      ),
    },
    {
      icon: 'invalidity',
      title: 'Invalidity Pension',
      tone: 'purple',
      without: 'No safety net. Savings go fast, and family has to step in.',
      withNis: (
        <>
          Invalidity Pension gives ongoing income of about{' '}
          <PerWeek weekly={b.invalidityWeekly} /> (at least{' '}
          {money(NIS.INVALIDITY_MIN_WEEKLY)} a week).
        </>
      ),
    },
    {
      icon: 'survivors',
      title: "Survivors' Benefit",
      tone: 'yellow',
      without:
        'Your partner, children or parents lose the income you brought in.',
      withNis: (
        <>
          Survivors&rsquo; Benefit shares about{' '}
          <PerWeek weekly={b.survivorsWeekly} /> among your partner, children or
          parents, plus a {money(b.childGrant)} grant per child.
        </>
      ),
    },
    {
      icon: 'pension',
      title: 'Old-Age Contributory Pension',
      tone: 'green',
      without: (
        <>
          Without a pension, that&rsquo;s about{' '}
          <strong>{money(risk.yearLost)}/year</strong> you&rsquo;d need to find
          from somewhere else.
        </>
      ),
      withNis: (
        <>
          An Old-Age Pension for life from age {NIS.PENSIONABLE_AGE}, starting
          around <PerWeek weekly={b.pensionWeekly} /> and growing the longer you
          contribute.
        </>
      ),
    },
    {
      icon: 'shield',
      title: 'Funeral Grant',
      tone: 'teal',
      without: 'Funeral costs land on your family at the worst possible time.',
      withNis: (
        <>
          A one-time Funeral Grant of{' '}
          <strong className="tabular-nums">{money(b.funeralGrant)}</strong>{' '}
          helps your family with the costs. Included at every level.
        </>
      ),
    },
  ]

  return (
    <div>
      <ServiceCaption />
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        What your plan protects you from
      </h1>
      <p className="mb-6 text-[1.125rem] text-mid-grey-00">
        For{' '}
        <strong className="text-black-00 tabular-nums">
          {money(b.monthlyContribution)}
        </strong>
        /month, here&rsquo;s each moment{' '}
        <strong className="text-red-00">without NISSS</strong> and{' '}
        <strong className="text-green-00">with it</strong>. Figures are
        estimates based on the amount you chose to put in.
      </p>
      <p className="mb-3 text-[1rem] text-mid-grey-00">
        Tap any benefit to see what happens.
      </p>

      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <BenefitCard
            defaultOpen={i === 0}
            icon={it.icon}
            key={it.title}
            title={it.title}
            tone={it.tone}
            without={it.without}
            withNis={it.withNis}
          />
        ))}
      </div>

      <div className="mt-6 border-blue-40 border-l-4 bg-grey-00/50 p-4 text-[1rem] text-black-00">
        <p>
          <strong>You don&rsquo;t have to plan for every scenario.</strong>{' '}
          NISSS gives you benefits across several of them at once. That&rsquo;s
          the point of a safety net.
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
        <Button onClick={onNext} type="button">
          Show me next steps
        </Button>
      </div>

      <p className="mt-3 text-center text-[0.95rem] text-mid-grey-00">
        Estimates only. Benefit amounts are calculated from your insurable
        earnings (your contribution ÷ {Math.round(NIS.SE_RATE * 10000) / 100}%)
        and your most recent year of contributions, and are subject to change.
        These figures are unverified placeholders pending confirmation by the
        NISSS Self-Employed Unit.
      </p>
    </div>
  )
}

/* ── Screen: next steps ─────────────────────────────────────────────── */
function ActionCard({
  href,
  icon,
  onClick,
  sub,
  title,
  tone,
}: {
  href?: string
  icon: string
  onClick?: () => void
  sub: string
  title: string
  tone: Tone
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <IconCircle name={icon} tint tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[1.25rem] text-black-00">{title}</p>
        <p className="mt-1 text-[1rem] text-black-00/80">{sub}</p>
      </div>
      <span className="mt-2 text-teal-00">
        <Icon className="h-5 w-5" name="arrowRight" strokeWidth={2} />
      </span>
    </div>
  )
  const cls = `block w-full rounded-2xl border-2 ${TONE[tone].border} ${TONE[tone].bg} p-5 text-left transition-colors hover:border-teal-00 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100`
  return href ? (
    <a className={cls} href={href}>
      {inner}
    </a>
  ) : (
    <button className={cls} onClick={onClick} type="button">
      {inner}
    </button>
  )
}

function NextSteps({
  onBack,
  onRegister,
  onRestart,
}: {
  onBack: () => void
  onRegister: () => void
  onRestart: () => void
}) {
  return (
    <div>
      <ServiceCaption />
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        Ready to take the next step?
      </h1>
      <p className="mb-6 text-[1.125rem] text-mid-grey-00">
        Choose what works best for you right now.
      </p>

      <div className="flex flex-col gap-3">
        <ActionCard
          icon="shield"
          onClick={onRegister}
          sub="Get set up to start contributing. Takes about 10 minutes."
          title="Register with NISSS"
          tone="teal"
        />
        <ActionCard
          href={`${HOWTO_HREF}#4-pay-your-contributions`}
          icon="card"
          sub="SurePay, EZpay+, bank, online, in person. Pick what works for you."
          title="See how to pay"
          tone="blue"
        />
        <ActionCard
          href="tel:+12464317400"
          icon="phone"
          sub="Have a question? Call NISSS on 431-7400 and an officer will help."
          title="Contact NISSS"
          tone="yellow"
        />
      </div>

      <div className="mt-6 border-blue-40 border-l-4 bg-grey-00/50 p-4 text-[1rem] text-black-00">
        <p>
          You can step away at any time. Joining is voluntary, and you choose
          how much to contribute.
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
        <Button onClick={onRestart} type="button">
          Return to start
        </Button>
      </div>
    </div>
  )
}

/* ── Screen: register routing ───────────────────────────────────────── */
const REG_OPTIONS: Array<{
  id: 'yes' | 'no' | 'unsure'
  label: string
  sub: string
}> = [
  {
    id: 'yes',
    label: 'Yes, I have one',
    sub: 'I worked for someone before, or registered already.',
  },
  {
    id: 'no',
    label: 'No, I never registered',
    sub: "I've always worked for myself.",
  },
  { id: 'unsure', label: "I'm not sure", sub: "Let's find out together." },
]

function RegisterPath({
  onBack,
  selected,
  setSelected,
}: {
  onBack: () => void
  selected: 'yes' | 'no' | 'unsure' | ''
  setSelected: (v: 'yes' | 'no' | 'unsure') => void
}) {
  const regRadio = rovingRadioProps(
    REG_OPTIONS,
    (o) => `reg-${o.id}`,
    REG_OPTIONS.findIndex((o) => o.id === selected),
    (i) => setSelected(REG_OPTIONS[i].id),
  )
  return (
    <div>
      <ServiceCaption />
      <h1 className="mb-2 font-bold text-[2.25rem] text-black-00 leading-[1.15] sm:text-[2.75rem]">
        Do you already have an NISSS number?
      </h1>
      <p className="mb-6 text-[1.125rem] text-mid-grey-00">
        If you worked for an employer before, you probably do. It&rsquo;s the
        same number for life.
      </p>

      <div
        aria-label="Do you already have an NISSS number?"
        className="flex flex-col gap-3"
        role="radiogroup"
      >
        {REG_OPTIONS.map((o, i) => {
          const isSel = selected === o.id
          return (
            <button
              aria-checked={isSel}
              className={`flex items-start gap-3 rounded-xl border-2 bg-white-00 p-4 text-left transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
                isSel
                  ? 'border-teal-00 bg-teal-10'
                  : 'border-grey-00 hover:border-teal-00 hover:bg-teal-10/40'
              }`}
              id={`reg-${o.id}`}
              key={o.id}
              onClick={() => setSelected(o.id)}
              onKeyDown={regRadio[i].onKeyDown}
              role="radio"
              tabIndex={regRadio[i].tabIndex}
              type="button"
            >
              <span
                className={`mt-1 inline-flex h-6 w-6 shrink-0 rounded-full ${
                  isSel
                    ? 'bg-teal-00 shadow-[0_0_0_3px_#fff]'
                    : 'border-2 border-mid-grey-00'
                }`}
              />
              <span className="flex-1">
                <span className="block font-semibold text-[1.25rem] text-black-00">
                  {o.label}
                </span>
                <span className="mt-1 block text-[1rem] text-mid-grey-00">
                  {o.sub}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {selected === 'yes' && (
        <p className="mt-6 text-[1.125rem]">
          You already have a number, so use the{' '}
          <Link
            href="https://www.nis.gov.bb/self-employment-registration-form-page/"
            rel="noopener noreferrer"
            target="_blank"
          >
            self-employment registration form
          </Link>{' '}
          to register as self-employed. It opens on the NISSS website.
        </p>
      )}
      {selected === 'no' && (
        <p className="mt-6 text-[1.125rem]">
          Use the{' '}
          <Link
            href="https://www.nis.gov.bb/self-employment-registration-form-new-nis-applicant/"
            rel="noopener noreferrer"
            target="_blank"
          >
            new applicant registration form
          </Link>{' '}
          to get your number and register. It opens on the NISSS website.
        </p>
      )}
      {selected === 'unsure' && (
        <div className="mt-6 border-blue-40 border-l-4 bg-grey-00/50 p-4 text-[1rem] text-black-00">
          <p>
            Ask NISSS to look up your number before you register — call{' '}
            <Link href="tel:+12464317400">431-7400</Link>. If you already have
            one, you keep it for life, so there is no need to sign up again.
          </p>
        </div>
      )}

      <div className="mt-6">
        <Button onClick={onBack} type="button" variant="secondary">
          Previous
        </Button>
      </div>
    </div>
  )
}
