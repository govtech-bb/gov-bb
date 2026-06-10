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
  } else if (spec.htmlType === "checkbox") {
    widget = <BooleanAnswer onAnswer={onAnswer} spec={spec} />;
  } else if (spec.htmlType === "date") {
    widget = <DateAnswer onAnswer={onAnswer} spec={spec} />;
  } else {
    // Free-text fields have no in-bubble input: the composer already is the
    // text input, and a second box would duplicate it (focus + a11y cost).
    widget = <HintOrError hint={spec.hint} error={null} />;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p id={questionId} className="text-bubble font-medium text-black-00">
        {spec.label}
      </p>
      {widget}
    </div>
  );
}

type AnswerProps = {
  spec: FieldSpec;
  onAnswer: (text: string) => void;
};

// Real checkboxes with the EXACT contract wording (forms parity); picks go
// back as ONE comma-separated message.
function CheckboxAnswer({ spec, onAnswer }: AnswerProps) {
  const options = spec.options ?? [];
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (value: string) => {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const submit = () => {
    const chosen = options.filter((o) => picked.has(o.value));
    const err = validateSpecValue(
      spec,
      chosen.map((o) => o.value),
    );
    if (err) {
      setError(err);
      return;
    }
    onAnswer(chosen.map((o) => o.label).join(", "));
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
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const err = validateSpecValue(spec, checked);
    if (err) {
      setError(err);
      return;
    }
    onAnswer(checked ? "Yes" : "No");
  };

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <Checkbox
        checked={checked}
        label="Yes"
        onCheckedChange={() => {
          setError(null);
          setChecked((c) => !c);
        }}
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
  const [date, setDate] = useState<DateInputValue>({
    day: "",
    month: "",
    year: "",
  });
  const [error, setError] = useState<string | null>(null);
  const { day, month, year } = date;
  const complete = day !== "" && month !== "" && year.length === 4;

  const submit = () => {
    const err = validateSpecValue(spec, date);
    if (err) {
      setError(err);
      return;
    }
    onAnswer(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <DateInput
        name={spec.fieldId}
        onChange={(next) => {
          setError(null);
          setDate(next);
        }}
        value={date}
      />
      <Button disabled={!complete} onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}
