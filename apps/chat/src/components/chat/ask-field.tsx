import type { InferToolOutput } from "@tanstack/ai";
import type { Primitive } from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import {
  Button,
  Checkbox,
  DateInput,
  type DateInputValue,
} from "@govtech-bb/react";
import { type ReactNode, useState } from "react";
import { askFieldDef } from "#/lib/chat-tools";
import { ChoicePills } from "./choice-pills";

export type AskFieldOutput = InferToolOutput<typeof askFieldDef>;
export type FieldSpec = NonNullable<AskFieldOutput["field"]>;

// Secondary "Skip" affordance for an optional free-text field. Styled like the
// dismissive "Not yet" submit-decline button (grey outline), not the teal
// answer pills — skipping is declining to answer, not picking an answer.
const SKIP_BTN =
  "self-start rounded-full border-[1.5px] border-mid-grey-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-mid-grey-00 transition-colors hover:border-black-00 hover:text-black-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// Same engine the forms app runs: a bad value swaps the hint for the error in
// this bubble instead of spawning an error turn. set_field re-validates
// server-side (cross-field rules need the full session). The cast is the wire
// boundary — the spec is the contract field serialized through the tool result.
function validateSpecValue(spec: FieldSpec, value: unknown): string | null {
  const field = {
    fieldId: spec.fieldId,
    label: spec.label,
    htmlType: spec.htmlType,
    options: spec.options,
    multiple: spec.multiple,
    validations: spec.validations,
  } as unknown as Primitive;
  return validateField(field, value, {}, {})[0] ?? null;
}

function HintOrError({
  hint,
  error,
}: {
  hint?: string;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="font-medium text-red-00 text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (hint) return <p className="text-mid-grey-00 text-sm">{hint}</p>;
  return null;
}

// The spec comes from the CONTRACT via the tool result — never model-authored
// args — so labels and options can't be hallucinated. Answers go back as plain
// user messages (option labels; dates as YYYY-MM-DD): turn-based, refresh-safe.
// Once a later turn lands (`answered`) the input collapses to its label, so
// the transcript reads as Q/A pairs.
export function AskFieldWidget({
  spec,
  messageId,
  answered,
  onAnswer,
}: {
  spec: FieldSpec;
  messageId: string;
  answered: boolean;
  onAnswer: (text: string) => void;
}) {
  const questionId = `ask-field-q-${messageId}`;
  const options = spec.options ?? [];

  if (answered) {
    return (
      <p className="text-bubble font-medium text-black-00">{spec.label}</p>
    );
  }

  let widget: ReactNode;
  if (options.length > 0 && (spec.htmlType === "checkbox" || spec.multiple)) {
    widget = <CheckboxAnswer onAnswer={onAnswer} spec={spec} />;
  } else if (options.length > 0) {
    widget = (
      <div className="flex flex-col gap-2.5">
        <HintOrError hint={spec.hint} error={null} />
        <ChoicePills
          questionId={questionId}
          labelledBy={questionId}
          choices={options.map((o) => o.label)}
          onPick={onAnswer}
        />
      </div>
    );
  } else if (spec.htmlType === "show-hide") {
    // A toggle is ALWAYS a Yes/No choice — never a text input. The server
    // synthesizes Yes/No options (caught by the pills branch above); this
    // is the floor for a spec that arrives without them.
    widget = (
      <div className="flex flex-col gap-2.5">
        <HintOrError hint={spec.hint} error={null} />
        <ChoicePills
          questionId={questionId}
          labelledBy={questionId}
          choices={["Yes", "No"]}
          onPick={onAnswer}
        />
      </div>
    );
  } else if (spec.htmlType === "checkbox") {
    widget = <BooleanAnswer onAnswer={onAnswer} spec={spec} />;
  } else if (spec.htmlType === "date") {
    widget = <DateAnswer onAnswer={onAnswer} spec={spec} />;
  } else if (!spec.validations?.required) {
    // Optional free-text field. The composer is the text input, so there's no
    // in-bubble box — but in chat there's also no "Continue" button to press
    // past an unanswered field, which would force the user to invent a comment.
    // Offer a Skip button instead: clicking it sends a plain "Skip" message
    // (same path the choice pills use), which the collection prompt treats as
    // "leave blank, advance to review". (presence of the `required` rule means
    // required — mirrors isRequired() in form/schema.ts.)
    widget = (
      <div className="flex flex-col gap-2.5">
        <HintOrError hint={spec.hint} error={null} />
        <button className={SKIP_BTN} onClick={() => onAnswer("Skip")} type="button">
          Skip
        </button>
      </div>
    );
  } else {
    // Required free-text field: the composer is the input, and a second box
    // would duplicate it (focus + a11y cost). No skip — the answer is required.
    widget = <HintOrError hint={spec.hint} error={null} />;
  }

  // Escape-hatch alternative (e.g. "Use passport number instead" under the
  // National ID question) — forms-UI parity, where the show-hide toggle sits
  // directly below its target field. Clicking sends the toggle's label as the
  // answer; the collection prompt records the toggle, not this field.
  const alt = spec.alternative;

  return (
    <div className="flex flex-col gap-2.5">
      <p id={questionId} className="text-bubble font-medium text-black-00">
        {spec.label}
      </p>
      {widget}
      {alt && (
        <div className="flex flex-col gap-1.5">
          {alt.hint && <p className="text-mid-grey-00 text-sm">{alt.hint}</p>}
          <button
            className={SKIP_BTN}
            onClick={() => onAnswer(alt.label)}
            type="button"
          >
            {alt.label}
          </button>
        </div>
      )}
    </div>
  );
}

type AnswerProps = {
  spec: FieldSpec;
  onAnswer: (text: string) => void;
};

// Shared value+error state for the typed answer widgets: every change clears
// the error, Continue runs the shared validation engine and either shows the
// error in place or sends the answer text. The widgets differ only in what
// they validate (`validatable`) and what they send (`answerText`).
function useAnswerState<T>(
  spec: FieldSpec,
  initial: T,
  opts: {
    validatable: (value: T) => unknown;
    answerText: (value: T) => string;
    onAnswer: (text: string) => void;
  },
) {
  const [value, setValueRaw] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);

  const setValue = (next: T | ((prev: T) => T)) => {
    setError(null);
    setValueRaw(next);
  };

  const submit = () => {
    const err = validateSpecValue(spec, opts.validatable(value));
    if (err) {
      setError(err);
      return;
    }
    opts.onAnswer(opts.answerText(value));
  };

  return { value, setValue, error, submit };
}

// Real checkboxes with the EXACT contract wording (forms parity); picks go
// back as ONE comma-separated message.
function CheckboxAnswer({ spec, onAnswer }: AnswerProps) {
  const options = spec.options ?? [];
  const chosen = (picked: ReadonlySet<string>) =>
    options.filter((o) => picked.has(o.value));
  const { value: picked, setValue, error, submit } = useAnswerState(
    spec,
    new Set<string>() as ReadonlySet<string>,
    {
      validatable: (p) => chosen(p).map((o) => o.value),
      answerText: (p) =>
        chosen(p)
          .map((o) => o.label)
          .join(", "),
      onAnswer,
    },
  );

  const toggle = (value: string) => {
    setValue((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <Checkbox
            checked={picked.has(o.value)}
            key={o.value}
            label={o.label}
            onCheckedChange={() => toggle(o.value)}
          />
        ))}
      </div>
      <Button onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}

// Boolean checkbox (no options) — a consent/yes-no toggle. A required rule
// means it must be ticked, which the client-side engine reports in place.
function BooleanAnswer({ spec, onAnswer }: AnswerProps) {
  const { value: checked, setValue, error, submit } = useAnswerState(
    spec,
    false,
    {
      validatable: (c) => c,
      answerText: (c) => (c ? "Yes" : "No"),
      onAnswer,
    },
  );

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <Checkbox
        checked={checked}
        label="Yes"
        onCheckedChange={() => setValue((c) => !c)}
      />
      <Button onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}

// Answers as ISO YYYY-MM-DD (what the server's date coercion parses); date
// rules run on Continue so "needs to be in the past" lands here, not as a turn.
function DateAnswer({ spec, onAnswer }: AnswerProps) {
  const { value: date, setValue, error, submit } = useAnswerState(
    spec,
    { day: "", month: "", year: "" } as DateInputValue,
    {
      validatable: (d) => d,
      answerText: ({ day, month, year }) =>
        `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      onAnswer,
    },
  );
  const { day, month, year } = date;
  const complete = day !== "" && month !== "" && year.length === 4;

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <DateInput name={spec.fieldId} onChange={setValue} value={date} />
      <Button disabled={!complete} onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}
