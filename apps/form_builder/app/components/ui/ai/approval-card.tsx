import { useEffect, useId, useRef, useState } from "react";
import type { AiQuestion, AiAnswers } from "@govtech-bb/form-builder";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "hugeicons-react";
import s from "./components.module.css";

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
      <p role="status" className={s.answerSent}>
        <CheckmarkCircle02Icon size={16} aria-hidden="true" />
        Response sent
      </p>
    );
  return (
    <section
      className={s.approvalCard}
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
          className={s.question}
        >
          <legend ref={heading} tabIndex={-1}>
            {question.question}
          </legend>
          <span className={s.questionHint}>
            {question.type === "check" ? "Choose any that apply" : "Choose one"}
          </span>
          {question.options.map((option, i) => (
            <label key={`${index}-${i}`} className={s.option}>
              <input
                type={question.type === "check" ? "checkbox" : "radio"}
                name={`${id}-${index}`}
                checked={value.choices.includes(option)}
                onChange={() => {
                  const choices =
                    question.type === "radio"
                      ? [option]
                      : value.choices.includes(option)
                        ? value.choices.filter((item) => item !== option)
                        : [...value.choices, option];
                  setAnswers({
                    ...answers,
                    [index]: {
                      choices,
                      custom: question.type === "radio" ? "" : value.custom,
                    },
                  });
                }}
              />
              <span>{option}</span>
            </label>
          ))}
          <label className={s.customAnswer}>
            <span>Something else</span>
            <input
              aria-label="Custom answer"
              placeholder="Write your answer…"
              value={value.custom}
              maxLength={2000}
              onChange={(event) =>
                setAnswers({
                  ...answers,
                  [index]: {
                    custom: event.target.value,
                    choices: question.type === "radio" ? [] : value.choices,
                  },
                })
              }
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <footer className={s.questionFooter}>
          <div className={s.questionNav}>
            <button
              type="button"
              aria-label="Previous question"
              disabled={index === 0 || sending || disabled}
              onClick={() => setIndex(index - 1)}
            >
              <ArrowLeft01Icon size={14} aria-hidden="true" />
            </button>
            <span aria-live="polite" className={s.counter}>
              {index + 1} / {questions.length}
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={last || sending || disabled}
              onClick={() => setIndex(index + 1)}
            >
              <ArrowRight01Icon size={14} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            disabled={disabled || sending}
            onClick={() => {
              if (last) void submit();
              else setIndex(index + 1);
            }}
          >
            Skip
          </button>
          <button
            type="submit"
            className={s.emphasis}
            disabled={disabled || sending || !hasAnswer}
          >
            {sending ? "Sending…" : last ? "Send answers" : "Continue"}
          </button>
        </footer>
      </form>
      <button
        type="button"
        className={s.skipQuestions}
        disabled={disabled || sending}
        onClick={() => void submit(true)}
      >
        Skip all questions
      </button>
    </section>
  );
}
