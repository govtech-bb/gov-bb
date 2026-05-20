import { useState  } from "react";
import type {ReactNode} from "react";
import { calculatePension  } from "./compute.ts";
import type {PensionEstimate} from "./compute.ts";

const moneyFmt = new Intl.NumberFormat("en-BB", {
  style: "currency",
  currency: "BBD",
  maximumFractionDigits: 2,
});

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="my-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  type = "button",
  children,
}: {
  onClick?: () => void;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="rounded-md bg-[var(--lagoon-deep,#0a5e6b)] px-5 py-2.5 text-sm font-semibold text-white"
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

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}

function ResultPanel({ estimate, onReset }: { estimate: PensionEstimate; onReset: () => void }) {
  return (
    <Card>
      <h3 className="mb-2 text-lg font-semibold">Your estimated pension</h3>
      <p className="m-0 text-sm text-stone-600">
        Based on {estimate.months} month{estimate.months === 1 ? "" : "s"} of service and a last
        annual salary of {moneyFmt.format(estimate.salary)}.
      </p>

      {estimate.serviceWarning ? (
        <div className="mt-4 rounded-md border-l-4 border-amber-400 bg-amber-50 p-4 text-sm">
          <p className="m-0 font-semibold">You may not be entitled to a pension.</p>
          <p className="m-0 mt-1">
            Workers with fewer than 10 years (120 months) of pensionable service who leave during
            that period do not receive a pension. The figures below are shown for information only.
          </p>
        </div>
      ) : null}

      <h4 className="mt-6 mb-2 text-base font-semibold">Full pension</h4>
      <dl className="m-0 grid grid-cols-2 gap-y-1 text-sm">
        <ResultRow label="Annual amount" value={moneyFmt.format(estimate.fullAnnual)} />
        <ResultRow label="Monthly payment" value={moneyFmt.format(estimate.fullMonthly)} />
      </dl>

      <h4 className="mt-6 mb-2 text-base font-semibold">Reduced pension</h4>
      <dl className="m-0 grid grid-cols-2 gap-y-1 text-sm">
        <ResultRow label="Annual amount" value={moneyFmt.format(estimate.reducedAnnual)} />
        <ResultRow label="Monthly payment" value={moneyFmt.format(estimate.reducedMonthly)} />
      </dl>

      <div className="mt-6 rounded-md border-l-4 border-green-500 bg-green-50 p-4">
        <p className="m-0 text-sm font-medium text-green-900">Gratuity (lump sum)</p>
        <p className="m-0 mt-1 text-3xl font-bold text-green-900">
          {moneyFmt.format(estimate.gratuity)}
        </p>
      </div>

      <p className="m-0 mt-4 text-xs text-stone-600">
        These figures are estimates only. Contact the Personnel Administration Division to discuss
        which option suits your circumstances before you retire.
      </p>

      <div className="mt-6">
        <SecondaryButton onClick={onReset}>Recalculate</SecondaryButton>
      </div>
    </Card>
  );
}

export function PensionCalculator() {
  const [monthsRaw, setMonthsRaw] = useState("");
  const [salaryRaw, setSalaryRaw] = useState("");
  const [monthsError, setMonthsError] = useState("");
  const [salaryError, setSalaryError] = useState("");
  const [estimate, setEstimate] = useState<PensionEstimate | null>(null);

  function reset() {
    setMonthsRaw("");
    setSalaryRaw("");
    setMonthsError("");
    setSalaryError("");
    setEstimate(null);
  }

  function submit() {
    const trimmedMonths = monthsRaw.trim();
    const monthsNum = Number.parseInt(trimmedMonths, 10);
    const salaryNum = Number.parseFloat(salaryRaw.replace(/,/g, ""));

    let mErr = "";
    let sErr = "";
    if (!trimmedMonths) {
      mErr = "Enter your total months of pensionable service";
    } else if (!/^\d+$/.test(trimmedMonths) || !Number.isFinite(monthsNum) || monthsNum <= 0) {
      mErr = "Months of pensionable service must be a whole number greater than 0";
    }
    if (!salaryRaw.trim()) {
      sErr = "Enter your last annual salary";
    } else if (!Number.isFinite(salaryNum) || salaryNum <= 0) {
      sErr = "Last annual salary must be an amount greater than 0";
    }

    setMonthsError(mErr);
    setSalaryError(sErr);
    if (mErr || sErr) {
      setEstimate(null);
      return;
    }
    setEstimate(calculatePension({ months: monthsNum, salary: salaryNum }));
  }

  if (estimate) return <ResultPanel estimate={estimate} onReset={reset} />;

  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold">Estimate your pension</h3>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Months of pensionable service</span>
          <span className="text-xs text-stone-600">
            Enter the total number of complete months. No-pay leave does not count.
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={monthsRaw}
            onChange={(e) => setMonthsRaw(e.target.value)}
            aria-invalid={!!monthsError}
            className="rounded-md border border-stone-300 px-3 py-2"
          />
          {monthsError ? <span className="text-xs text-red-700">{monthsError}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Last annual salary (BDS$)</span>
          <span className="text-xs text-stone-600">
            Enter your gross annual salary in Barbados dollars.
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={salaryRaw}
            onChange={(e) => setSalaryRaw(e.target.value)}
            aria-invalid={!!salaryError}
            className="rounded-md border border-stone-300 px-3 py-2"
          />
          {salaryError ? <span className="text-xs text-red-700">{salaryError}</span> : null}
        </label>

        <div>
          <PrimaryButton type="submit">Calculate pension</PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
