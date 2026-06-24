import { humanise } from "#/lib/chat/labels";

// "Check your answers" + Submit/Cancel, rendered from a submitForm tool-call
// that's awaiting approval (the framework pauses the run until the user
// responds). The values come from the tool ARGUMENTS, so the user confirms
// exactly what will be sent; labels come from the CONTRACT (threaded down from
// the presentField outputs) so they read like the form, not a fieldId slug.
// Each row has a Change link that cancels the pending submit and re-asks that
// field. Submit → approve (the server then validates + submits, dry-run unless
// SUBMIT_LIVE); Cancel → deny. Mirrors the forms app's check-your-answers step.

// Map a submit value to its option label for display — the args carry option
// VALUES, the card should read like the form. Handles comma-joined multi-select
// values; an unmapped value (free text) shows as-is.
function displayValue(
  value: string,
  optionLabels: Record<string, string> | undefined,
): string {
  if (!optionLabels) return value;
  return value
    .split(/,\s*/)
    .map((v) => optionLabels[v] ?? v)
    .join(", ");
}

export function ApprovalCard({
  argsJson,
  labels = {},
  valueLabels = {},
  disabled = false,
  onRespond,
  onChange,
}: {
  argsJson?: string;
  labels?: Record<string, string>;
  valueLabels?: Record<string, Record<string, string>>;
  disabled?: boolean;
  onRespond: (approved: boolean) => void;
  onChange?: (fieldLabel: string) => void;
}) {
  let values: Record<string, string> = {};
  try {
    values = (JSON.parse(argsJson ?? "{}").values ?? {}) as Record<string, string>;
  } catch {
    values = {};
  }
  const entries = Object.entries(values);

  return (
    <div className="flex max-w-[92%] flex-col gap-3">
      <p className="text-bubble font-medium text-black-00">Check your answers</p>
      <dl className="flex flex-col divide-y divide-grey-00 rounded-lg border border-grey-00 bg-white-00 px-4">
        {entries.map(([fieldId, value]) => {
          const label = labels[fieldId] ?? humanise(fieldId);
          return (
            <div
              className="flex items-start justify-between gap-3 py-2.5"
              key={fieldId}
            >
              <div className="min-w-0 flex-1">
                <dt className="text-disclaimer text-mid-grey-00">{label}</dt>
                <dd className="wrap-break-word text-bubble font-medium text-black-00">
                  {displayValue(value, valueLabels[fieldId])}
                </dd>
              </div>
              {onChange && !disabled && (
                <button
                  className="shrink-0 text-disclaimer text-teal-00 underline hover:text-teal-100"
                  onClick={() => onChange(label)}
                  type="button"
                >
                  Change
                  <span className="sr-only"> {label}</span>
                </button>
              )}
            </div>
          );
        })}
      </dl>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onRespond(true)}
          className="rounded-lg bg-teal-00 px-4 py-2 text-bubble font-medium text-white hover:bg-teal-100"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={() => onRespond(false)}
          className="rounded-lg border-[1.5px] border-mid-grey-00 px-4 py-2 text-bubble font-medium text-mid-grey-00 hover:border-black-00 hover:text-black-00"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
