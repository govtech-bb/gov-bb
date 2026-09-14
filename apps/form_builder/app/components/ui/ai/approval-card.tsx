import { Radio } from "../radio";
import { Checkbox } from "../checkbox";
import { Elevated } from "../surface";
import { Button } from "../button";
import { Input } from "../input";
import { useEffect, useId, useRef, useState } from "react";
import type { AiQuestion, AiAnswers } from "@govtech-bb/form-builder";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "hugeicons-react";

export function ApprovalCard({
  questions,
  disabled = false,
  onSubmit,
}: {
  questions: AiQuestion[];
  disabled?: boolean;
  onSubmit: (answers: AiAnswers) => Promise<void>;
}) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<number, { choices: string[]; custom: string }>
  >({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const heading = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    if (index > 0) heading.current?.focus();
  }, [index]);
  const question = questions[index];
  if (!question) return null;
  const value = answers[index] ?? { choices: [], custom: "" };
  const last = index === questions.length - 1;
  const hasAnswer = value.choices.length > 0 || !!value.custom.trim();
  const submit = async (skipAll = false) => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    setSending(true);
    setError("");
    const filled = skipAll
      ? []
      : questions
          .map((q, i) => ({
            question: q.question,
            choices: answers[i]?.choices ?? [],
            custom: answers[i]?.custom.trim() ?? "",
          }))
          .filter((a) => a.choices.length || a.custom);
    try {
      await onSubmit({
        status: filled.length ? "answered" : "skipped",
        answers: filled,
      });
      setSent(true);
    } catch {
      setError("Answers could not be sent. Try again.");
      submitted.current = false;
    } finally {
      setSending(false);
    }
  };
  if (sent)
    return (
      <p
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full bg-ui-tint px-2.5 py-1.5 text-[12px] text-ui-subtle"
      >
        <CheckmarkCircle02Icon size={16} aria-hidden="true" />
        Response sent
      </p>
    );
  return (
    <Elevated
      render={<section />}
      offset={1}
      shadowLevel={1}
      className="my-3 w-full max-w-md rounded-xl p-3.5"
      aria-label="Questions from the assistant"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (hasAnswer) {
            if (last) void submit();
            else setIndex(index + 1);
          }
        }}
      >
        <fieldset
          disabled={disabled || sending}
          key={index}
          className="m-0 min-inline-0 border-0 p-0 motion-safe:animate-ai-appear [&_legend]:mb-1.5 [&_legend]:p-0 [&_legend]:text-[14px] [&_legend]:leading-5 [&_legend]:font-medium [&_legend]:wrap-anywhere"
        >
          <legend ref={heading} tabIndex={-1}>
            {question.question}
          </legend>
          <span className="mb-2 block text-[11px] text-ui-subtle">
            {question.type === "check" ? "Choose any that apply" : "Choose one"}
          </span>
          {question.type === "radio" ? (
            <Radio
              name={`${id}-${index}`}
              value={value.choices[0] ?? ""}
              disabled={disabled || sending}
              onValueChange={(choice) =>
                setAnswers({
                  ...answers,
                  [index]: { choices: [choice], custom: "" },
                })
              }
              className="gap-0 [&>div]:gap-1"
            >
              <Radio.Legend className="sr-only">
                {question.question}
              </Radio.Legend>
              {question.options.map((option) => (
                <Radio.Item
                  key={option}
                  value={option}
                  label={option}
                  className="min-h-9 w-full items-center rounded-lg px-2 py-1.5 hover:bg-ui-tint has-[[data-checked]]:bg-ui-tint [&>span]:text-[13px] [&>span]:leading-5"
                />
              ))}
            </Radio>
          ) : (
            <div className="grid gap-1">
              {question.options.map((option) => (
                <Checkbox.Item
                  key={option}
                  label={option}
                  disabled={disabled || sending}
                  checked={value.choices.includes(option)}
                  className="min-h-9 w-full items-center rounded-lg px-2 py-1.5 hover:bg-ui-tint has-[[data-checked]]:bg-ui-tint [&>span]:text-[13px] [&>span]:leading-5"
                  onCheckedChange={(checked) =>
                    setAnswers({
                      ...answers,
                      [index]: {
                        choices: checked
                          ? [...value.choices, option]
                          : value.choices.filter((item) => item !== option),
                        custom: value.custom,
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
          <div className="pt-2">
            <Input
              aria-label="Custom answer"
              placeholder="Write your answer…"
              value={value.custom}
              maxLength={2000}
              size="sm"
              onChange={(event) =>
                setAnswers({
                  ...answers,
                  [index]: {
                    custom: event.target.value,
                    choices: question.type === "radio" ? [] : value.choices,
                  },
                })
              }
              className="h-9 w-full min-w-0 bg-transparent text-[13px]"
            />
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-ui-danger">
            {error}
          </p>
        )}
        <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-ui-hairline pt-2.5">
          <div className="me-auto flex items-center gap-0.5 text-[11px] text-ui-subtle">
            <Button
              type="button"
              aria-label="Previous question"
              disabled={index === 0 || sending || disabled}
              onClick={() => setIndex(index - 1)}
              variant="ghost"
              size="sm"
              shape="square"
            >
              <ArrowLeft01Icon size={14} aria-hidden="true" />
            </Button>
            <span aria-live="polite" className="whitespace-nowrap tabular-nums">
              {index + 1} / {questions.length}
            </span>
            <Button
              type="button"
              aria-label="Next question"
              disabled={last || sending || disabled}
              onClick={() => setIndex(index + 1)}
              variant="ghost"
              size="sm"
              shape="square"
            >
              <ArrowRight01Icon size={14} aria-hidden="true" />
            </Button>
          </div>
          <Button
            type="button"
            disabled={disabled || sending}
            onClick={() => {
              if (last) void submit();
              else setIndex(index + 1);
            }}
            variant="ghost"
            size="sm"
            className="text-[12px]"
          >
            Skip
          </Button>
          <Button
            type="submit"
            disabled={disabled || sending || !hasAnswer}
            variant="primary"
            size="sm"
            className="text-[12px]"
          >
            {sending ? "Sending…" : last ? "Send answers" : "Continue"}
          </Button>
        </footer>
      </form>
      <Button
        type="button"
        disabled={disabled || sending}
        onClick={() => void submit(true)}
        variant="ghost"
        size="sm"
        className="mt-1 text-[11px] font-normal"
      >
        Skip all questions
      </Button>
    </Elevated>
  );
}
