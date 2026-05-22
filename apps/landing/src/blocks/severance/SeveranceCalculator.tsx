import { useState  } from "react";
import type {ReactNode} from "react";
import {
  Employment,
  PayPeriod,
  Reason,
  ReasonLabel,
  calculateSeverance
  
  
} from "./compute.ts";
import type {SeveranceInputs, SeveranceResult} from "./compute.ts";

type Step =
  | { name: "q-employment" }
  | { name: "q-reason"; employment: Employment }
  | { name: "q-dates"; employment: Employment; reason: Reason }
  | {
      name: "q-pay";
      employment: Employment;
      reason: Reason;
      startIso: string;
      endIso: string;
    }
  | { name: "result"; inputs: SeveranceInputs; result: SeveranceResult };

const initial: Step = { name: "q-employment" };

const moneyFmt = new Intl.NumberFormat("en-BB", {
  style: "currency",
  currency: "BBD",
  maximumFractionDigits: 2,
});

function assertNever(x: never): never {
  throw new Error(`Unhandled step: ${JSON.stringify(x)}`);
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="my-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

function StepHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-4 text-lg font-semibold">{children}</h3>;
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-[var(--lagoon-deep,#0a5e6b)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium"
    >
      {children}
    </button>
  );
}

function RadioRow<V extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: V | null;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (v: V) => void;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
            value === opt.value
              ? "border-[var(--lagoon-deep,#0a5e6b)] bg-[rgba(79,184,178,0.08)]"
              : "border-stone-200"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function IneligiblePanel({ result }: { result: Extract<SeveranceResult, { kind: "ineligible" }> }) {
  const message: Record<typeof result.reason, string> = {
    "self-employed":
      "Self-employed people aren't entitled to severance under the Severance Payments Act.",
    "reason-not-covered":
      "The reason given isn't one of the categories the Act covers. Check with the NIS office for guidance.",
    "under-one-year":
      "You need at least one complete year of service to qualify for severance.",
  };
  return (
    <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-4">
      <p className="m-0 font-semibold">You may not be eligible</p>
      <p className="m-0 mt-1 text-sm">{message[result.reason]}</p>
    </div>
  );
}

function EligiblePanel({ result }: { result: Extract<SeveranceResult, { kind: "eligible" }> }) {
  return (
    <div className="rounded-md border-l-4 border-green-500 bg-green-50 p-4">
      <p className="m-0 text-sm font-medium text-green-900">Estimated severance</p>
      <p className="m-0 mt-1 text-3xl font-bold text-green-900">
        {moneyFmt.format(result.severance)}
      </p>
      <dl className="m-0 mt-4 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-stone-600">Complete years of service</dt>
        <dd className="text-right font-medium">{result.years}</dd>
        <dt className="text-stone-600">Average weekly pay</dt>
        <dd className="text-right font-medium">{moneyFmt.format(result.avgWeekly)}</dd>
        <dt className="text-stone-600">Entitled weeks</dt>
        <dd className="text-right font-medium">{result.entitledWeeks}</dd>
      </dl>
      {result.ceilingApplied ? (
        <p className="m-0 mt-3 text-xs text-stone-600">
          Capped at the insurable earnings ceiling of {moneyFmt.format(result.ceilingApplied.weekly)}/week.
        </p>
      ) : null}
      <p className="m-0 mt-3 text-xs text-stone-600">
        This is an estimate. The final amount is determined by the National Insurance Office.
      </p>
    </div>
  );
}

export function SeveranceCalculator() {
  const [step, setStep] = useState<Step>(initial);
  const reset = () => setStep(initial);

  switch (step.name) {
    case "q-employment":
      return (
        <Card>
          <StepHeading>Were you self-employed?</StepHeading>
          <RadioRow
            name="employment"
            value={null}
            options={[
              { value: Employment.No, label: "No, I was employed by someone" },
              { value: Employment.Yes, label: "Yes, I was self-employed" },
            ]}
            onChange={(employment) => setStep({ name: "q-reason", employment })}
          />
        </Card>
      );

    case "q-reason":
      return (
        <Card>
          <StepHeading>Why were you sent home?</StepHeading>
          <RadioRow
            name="reason"
            value={null}
            options={Object.values(Reason).map((r) => ({
              value: r,
              label: ReasonLabel[r],
            }))}
            onChange={(reason) =>
              setStep({ name: "q-dates", employment: step.employment, reason })
            }
          />
          <div className="mt-4">
            <SecondaryButton onClick={() => setStep(initial)}>Back</SecondaryButton>
          </div>
        </Card>
      );

    case "q-dates":
      return <DatesStep step={step} setStep={setStep} reset={reset} />;

    case "q-pay":
      return <PayStep step={step} setStep={setStep} reset={reset} />;

    case "result":
      return (
        <Card>
          {step.result.kind === "eligible" ? (
            <EligiblePanel result={step.result} />
          ) : (
            <IneligiblePanel result={step.result} />
          )}
          <div className="mt-6">
            <SecondaryButton onClick={reset}>Start over</SecondaryButton>
          </div>
        </Card>
      );

    default:
      return assertNever(step);
  }
}

function DatesStep({
  step,
  setStep,
  reset,
}: {
  step: Extract<Step, { name: "q-dates" }>;
  setStep: (s: Step) => void;
  reset: () => void;
}) {
  const [startIso, setStartIso] = useState("");
  const [endIso, setEndIso] = useState("");
  const ready =
    startIso !== "" && endIso !== "" && new Date(endIso) > new Date(startIso);

  return (
    <Card>
      <StepHeading>When did you start and stop working?</StepHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Start date</span>
          <input
            type="date"
            value={startIso}
            onChange={(e) => setStartIso(e.target.value)}
            className="rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">End date</span>
          <input
            type="date"
            value={endIso}
            onChange={(e) => setEndIso(e.target.value)}
            className="rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-6 flex gap-3">
        <SecondaryButton onClick={reset}>Start over</SecondaryButton>
        <PrimaryButton
          disabled={!ready}
          onClick={() =>
            setStep({
              name: "q-pay",
              employment: step.employment,
              reason: step.reason,
              startIso,
              endIso,
            })
          }
        >
          Continue
        </PrimaryButton>
      </div>
    </Card>
  );
}

function PayStep({
  step,
  setStep,
  reset,
}: {
  step: Extract<Step, { name: "q-pay" }>;
  setStep: (s: Step) => void;
  reset: () => void;
}) {
  const [period, setPeriod] = useState<PayPeriod>(PayPeriod.Weekly);
  const [raw, setRaw] = useState("");
  const amount = Number.parseFloat(raw.replace(/,/g, ""));
  const ready = Number.isFinite(amount) && amount > 0;

  const submit = () => {
    const inputs: SeveranceInputs = {
      employment: step.employment,
      reason: step.reason,
      startIso: step.startIso,
      endIso: step.endIso,
      period,
      simpleAvg: amount,
    };
    setStep({ name: "result", inputs, result: calculateSeverance(inputs) });
  };

  return (
    <Card>
      <StepHeading>What were you paid?</StepHeading>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium">Pay period</legend>
        <RadioRow
          name="period"
          value={period}
          options={[
            { value: PayPeriod.Weekly, label: "Weekly" },
            { value: PayPeriod.Monthly, label: "Monthly" },
          ]}
          onChange={setPeriod}
        />
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Average insurable earnings</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={period === PayPeriod.Weekly ? "e.g. 950" : "e.g. 4100"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-2"
        />
      </label>
      <div className="mt-6 flex gap-3">
        <SecondaryButton onClick={reset}>Start over</SecondaryButton>
        <PrimaryButton disabled={!ready} onClick={submit}>
          Calculate
        </PrimaryButton>
      </div>
    </Card>
  );
}
