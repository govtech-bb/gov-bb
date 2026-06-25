import { useState } from "react";
import {
  Button,
  Checkbox,
  DateInput,
  type DateInputValue,
} from "@govtech-bb/react";
import type { PresentedField } from "#/lib/chat/tools/present-field";
import { ChoicePills } from "./choice-pills";

// "Skip" affordance for an optional free-text field. Styled as a dismissive grey
// pill (not a teal answer pill) — skipping is declining to answer, not picking
// one. Shape matches ChoicePills; colour signals the difference.
const SKIP_BTN =
  "self-start rounded-full border-[1.5px] border-mid-grey-00 bg-transparent px-3.5 py-1.5 text-bubble font-medium text-mid-grey-00 transition-colors hover:border-black-00 hover:text-black-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// Renders one collection field from a presentField tool-call. The spec is
// contract-derived (server), never model-authored. Answers go back as plain user
// messages (option label, "YYYY-MM-DD", "Yes"/"No", comma-joined labels) — the
// same turn-based path as typing, and exactly what coerce.ts accepts. Once the
// user has answered (a later message exists), the widget collapses to its label
// so the transcript reads as clean Q/A. Validation runs server-side in setField;
// an invalid value comes back as a re-ask.
export function FieldWidget({
  spec,
  messageId,
  answered,
  onAnswer,
}: {
  spec: PresentedField;
  messageId: string;
  answered: boolean;
  onAnswer: (text: string) => void;
}) {
  if (!spec.found || !spec.label) return null;
  const labelId = `field-${messageId}-${spec.fieldId}`;
  const options = spec.options ?? [];

  if (answered) {
    return (
      <p className="text-bubble font-medium text-black-00">{spec.label}</p>
    );
  }

  let input: React.ReactNode = null;
  if (options.length > 0 && (spec.htmlType === "checkbox" || spec.multiple)) {
    input = <MultiAnswer idBase={labelId} options={options} onAnswer={onAnswer} />;
  } else if (options.length > 0) {
    input = (
      <ChoicePills
        labelledBy={labelId}
        choices={options.map((o) => o.label)}
        onPick={onAnswer}
      />
    );
  } else if (spec.htmlType === "show-hide") {
    // A disclosure toggle is always a Yes/No choice, never a text box.
    input = (
      <ChoicePills labelledBy={labelId} choices={["Yes", "No"]} onPick={onAnswer} />
    );
  } else if (spec.htmlType === "checkbox") {
    input = <BooleanAnswer idBase={labelId} onAnswer={onAnswer} />;
  } else if (spec.htmlType === "date") {
    input = <DateAnswer fieldId={spec.fieldId} onAnswer={onAnswer} />;
  } else if (!spec.required) {
    // Optional free-text field: the composer is the text box, but nothing
    // advances past an unanswered field — so offer a Skip pill (sends "Skip",
    // the same turn-based path as a choice) to leave it blank and move on.
    input = (
      <button
        type="button"
        className={SKIP_BTN}
        onClick={() => onAnswer("Skip")}
      >
        Skip
      </button>
    );
  }
  // required text / textarea / email / tel / number: the composer is the input.

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-bubble font-medium text-black-00">
        {spec.label}
        {!spec.required && <span className="text-mid-grey-00"> (optional)</span>}
      </p>
      {spec.hint && (
        <p className="text-disclaimer text-mid-grey-00">{spec.hint}</p>
      )}
      {input}
    </div>
  );
}

// Day/month/year → "YYYY-MM-DD" (zero-padded, what coerce.ts parses).
function DateAnswer({
  fieldId,
  onAnswer,
}: {
  fieldId: string;
  onAnswer: (text: string) => void;
}) {
  const [date, setDate] = useState<DateInputValue>({
    day: "",
    month: "",
    year: "",
  });
  const { day, month, year } = date;
  const complete = day !== "" && month !== "" && year.length === 4;
  return (
    <div className="flex flex-col gap-2.5">
      <DateInput name={fieldId} value={date} onChange={setDate} />
      <Button
        type="button"
        disabled={!complete}
        onClick={() =>
          onAnswer(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
        }
      >
        Continue
      </Button>
    </div>
  );
}

// A consent/yes-no checkbox (no options) → "Yes"/"No".
function BooleanAnswer({
  idBase,
  onAnswer,
}: {
  idBase: string;
  onAnswer: (text: string) => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <Checkbox
        id={`${idBase}-yes`}
        checked={checked}
        label="Yes"
        onCheckedChange={() => setChecked((c) => !c)}
      />
      <Button type="button" onClick={() => onAnswer(checked ? "Yes" : "No")}>
        Continue
      </Button>
    </div>
  );
}

// Multi-select (checkbox or select[multiple]) → comma-joined chosen LABELS,
// which coerce.ts maps to the option values.
function MultiAnswer({
  idBase,
  options,
  onAnswer,
}: {
  idBase: string;
  options: { label: string; value: string }[];
  onAnswer: (text: string) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (value: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <Checkbox
            key={o.value}
            id={`${idBase}-${o.value}`}
            checked={picked.has(o.value)}
            label={o.label}
            onCheckedChange={() => toggle(o.value)}
          />
        ))}
      </div>
      <Button
        type="button"
        onClick={() =>
          onAnswer(
            options
              .filter((o) => picked.has(o.value))
              .map((o) => o.label)
              .join(", "),
          )
        }
      >
        Continue
      </Button>
    </div>
  );
}
