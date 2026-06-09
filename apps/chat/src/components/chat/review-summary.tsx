import type { InferToolOutput } from "@tanstack/ai";
import { reviewFormDef } from "#/lib/chat-tools";

export type ReviewOutput = InferToolOutput<typeof reviewFormDef>;
type ReviewItem = NonNullable<ReviewOutput["items"]>[number];

// Check-your-answers summary, mirroring the forms app's review step: a
// definition list of label/value rows with a per-row Change link. Values come
// from the review_form tool RESULT (session + contract) — never model text.
export function ReviewSummary({
  items,
  disabled,
  onChange,
}: {
  items: ReviewItem[];
  disabled: boolean;
  onChange: (label: string) => void;
}) {
  return (
    <dl className="flex flex-col divide-y divide-grey-00 rounded-[8px] border border-grey-00 bg-white-00 px-4">
      {items.map((item) => (
        <div
          className="flex items-start justify-between gap-3 py-2.5"
          key={item.fieldId}
        >
          <div className="min-w-0 flex-1">
            <dt className="text-mid-grey-00 text-sm">{item.label}</dt>
            <dd className="break-words font-medium text-black-00 text-sm">
              {item.value}
            </dd>
          </div>
          {!disabled && (
            <button
              className="shrink-0 text-sm text-teal-00 underline hover:text-teal-100"
              onClick={() => onChange(item.label)}
              type="button"
            >
              Change
              <span className="sr-only"> {item.label}</span>
            </button>
          )}
        </div>
      ))}
    </dl>
  );
}
