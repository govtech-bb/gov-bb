import type { InferToolInput, InferToolOutput, UIMessage } from "@tanstack/ai";
import { DateInput, type DateInputValue, Input, TextArea } from "@govtech-bb/react";
import { Allow, parse as parsePartialJson } from "partial-json";
import { memo, type ReactNode, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askFieldDef, presentChoicesDef } from "#/lib/chat-tools";
import { TridentAvatar } from "#/components/trident-avatar";
import {
  extractText,
  findToolCall,
  stripLeakedToolCalls,
} from "#/lib/chat/messages";
import { normalizeMarkdown } from "#/lib/chat/normalize-markdown";
import type { Citation } from "#/lib/chat/types";

const CITATION_HREF_PREFIX = "#citation-";

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

const PILL_FAVICON_COLORS = ["bg-blue-100", "bg-teal-100", "bg-yellow-100"];

function CitationMarker({ citation }: { citation: Citation }) {
  const host = sourceHost(citation.url);
  const label = citation.section
    ? `${citation.title} — ${citation.section}`
    : citation.title;
  const idx = Number.parseInt(citation.number, 10) - 1;
  const favColor =
    PILL_FAVICON_COLORS[
      ((idx % PILL_FAVICON_COLORS.length) + PILL_FAVICON_COLORS.length) %
        PILL_FAVICON_COLORS.length
    ] ?? PILL_FAVICON_COLORS[0];
  return (
    <a
      aria-label={`Source: ${label} (${host})`}
      className="ml-0.5 inline-flex items-center gap-1.5 rounded-[12px] border border-grey-00 bg-white-00 px-2.5 py-1 align-baseline text-mid-grey-00 text-xs no-underline transition-colors hover:border-mid-grey-00"
      href={citation.url}
      rel="noopener noreferrer"
      target="_blank"
      title={label}
    >
      <span
        aria-hidden="true"
        className={`size-3.5 rounded-[3px] ${favColor}`}
      />
      {host}
    </a>
  );
}

const Heading = ({ children }: { children?: ReactNode }) => (
  <h3 className="mt-3 mb-1 font-bold text-blue-100 first:mt-0">{children}</h3>
);

function buildMarkdownComponents(citations: Citation[]) {
  const byNumber = new Map(citations.map((c) => [c.number, c]));
  return {
    p: ({ children }: { children?: ReactNode }) => (
      <p className="my-2 first:mt-0 last:mb-0">{children}</p>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-bold text-blue-100">{children}</strong>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="mt-1 mb-3 list-disc space-y-1 pl-5">{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="mt-1 mb-3 list-decimal space-y-1 pl-5">{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    h1: Heading,
    h2: Heading,
    h3: Heading,
    a: ({ children, href }: { children?: ReactNode; href?: string }) => {
      if (typeof href === "string" && href.startsWith(CITATION_HREF_PREFIX)) {
        const num = href.slice(CITATION_HREF_PREFIX.length);
        const citation = byNumber.get(num);
        if (citation) return <CitationMarker citation={citation} />;
      }
      // Only allow safe URL schemes — block javascript:, data:, vbscript:,
      // etc. that a model could emit via prompt injection. Trim first: browsers
      // ignore leading whitespace before the scheme, so " javascript:" must not
      // slip past the allowlist.
      const trimmed = typeof href === "string" ? href.trim() : "";
      const safe = /^(https?:|mailto:|tel:|#)/i.test(trimmed);
      if (!safe) {
        return <span className="text-teal-00 underline">{children}</span>;
      }
      const external =
        trimmed.startsWith("http://") || trimmed.startsWith("https://");
      return (
        <a
          className="text-teal-00 underline hover:text-teal-100"
          href={trimmed}
          rel={external ? "noopener noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
  };
}

// Replace `[N]` (and consecutive `[1][2]`) with markdown anchor links that
// the `a` renderer turns into citation badges.
function annotateCitations(text: string, citations: Citation[]): string {
  if (!citations.length) return text;
  const valid = new Set(citations.map((c) => c.number));
  return text.replace(/\[(\d+)\]/g, (match, num) =>
    valid.has(num) ? `[${match}](${CITATION_HREF_PREFIX}${num})` : match,
  );
}

type ChoicesArgs = Partial<InferToolInput<typeof presentChoicesDef>>;

function parseChoiceArgs(raw: string | undefined): ChoicesArgs | undefined {
  if (!raw) return undefined;
  try {
    return parsePartialJson(raw, Allow.ALL) as ChoicesArgs;
  } catch {
    return undefined;
  }
}

type AskFieldOutput = InferToolOutput<typeof askFieldDef>;
type FieldSpec = NonNullable<AskFieldOutput["field"]>;

const CONTINUE_BTN =
  "self-start rounded-full bg-teal-00 px-4 py-1.5 font-medium text-sm text-white-00 transition-colors hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-mid-grey-00";

const PILL_BTN =
  "rounded-full border-[1.5px] border-teal-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-teal-00 transition-colors hover:bg-teal-00 hover:text-white-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-teal-00";

// Renders the right input widget for an ask_field spec. The spec comes from
// the CONTRACT via the tool result (part.output) — never from model-authored
// args — so labels and options can't be hallucinated. Every widget answers by
// sending a plain user message (option labels; dates as YYYY-MM-DD), keeping
// the flow turn-based and refresh-safe.
function AskFieldWidget({
  spec,
  messageId,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  messageId: string;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const questionId = `ask-field-q-${messageId}`;
  const options = spec.options ?? [];
  const labels = options.map((o) => o.label);

  let widget: ReactNode;
  if (options.length > 0 && (spec.htmlType === "checkbox" || spec.multiple)) {
    return (
      <MultiChoices
        questionId={questionId}
        question={spec.label}
        hint={spec.hint}
        choices={labels}
        disabled={disabled}
        onConfirm={(picks) => onAnswer(picks.join(", "))}
      />
    );
  } else if (options.length > 0) {
    widget = (
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={questionId}
      >
        {labels.map((label) => (
          <button
            className={PILL_BTN}
            disabled={disabled}
            key={label}
            onClick={() => onAnswer(label)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    );
  } else if (spec.htmlType === "checkbox") {
    widget = (
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={questionId}
      >
        {["Yes", "No"].map((label) => (
          <button
            className={PILL_BTN}
            disabled={disabled}
            key={label}
            onClick={() => onAnswer(label)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    );
  } else if (spec.htmlType === "date") {
    widget = (
      <DateAnswer
        disabled={disabled}
        name={spec.fieldId}
        onAnswer={onAnswer}
      />
    );
  } else {
    widget = (
      <TextAnswer
        disabled={disabled}
        htmlType={spec.htmlType}
        label={spec.label}
        onAnswer={onAnswer}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p id={questionId} className="text-bubble font-medium text-black-00">
        {spec.label}
      </p>
      {spec.hint && (
        <p className="text-mid-grey-00 text-sm">{spec.hint}</p>
      )}
      {widget}
    </div>
  );
}

function TextAnswer({
  htmlType,
  label,
  disabled,
  onAnswer,
}: {
  htmlType: string;
  label: string;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const submit = () => {
    if (trimmed) onAnswer(trimmed);
  };

  if (htmlType === "textarea") {
    return (
      <div className="flex flex-col gap-2">
        <TextArea
          aria-label={label}
          className="bg-white-00 text-black-00"
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          value={value}
        />
        <button
          className={CONTINUE_BTN}
          disabled={disabled || !trimmed}
          onClick={submit}
          type="button"
        >
          Continue
        </button>
      </div>
    );
  }

  const inputType =
    htmlType === "email" || htmlType === "tel" || htmlType === "number"
      ? htmlType
      : "text";
  return (
    <div className="flex items-end gap-2">
      <Input
        aria-label={label}
        className="flex-1 bg-white-00 text-black-00"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        type={inputType}
        value={value}
      />
      <button
        className={CONTINUE_BTN}
        disabled={disabled || !trimmed}
        onClick={submit}
        type="button"
      >
        Continue
      </button>
    </div>
  );
}

// GOV-style day/month/year input; answers as ISO YYYY-MM-DD, the shape the
// server's date coercion parses.
function DateAnswer({
  name,
  disabled,
  onAnswer,
}: {
  name: string;
  disabled: boolean;
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
    <div className="flex flex-col gap-2">
      <DateInput
        disabled={disabled}
        name={name}
        onChange={setDate}
        value={date}
      />
      <button
        className={CONTINUE_BTN}
        disabled={disabled || !complete}
        onClick={() =>
          onAnswer(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`)
        }
        type="button"
      >
        Continue
      </button>
    </div>
  );
}

// Checkbox-style multi-pick: toggle one or more options, then confirm. The
// confirmed picks go back as ONE comma-separated user message — the same list
// shape coerceList parses for checkbox / multi-select fields.
function MultiChoices({
  questionId,
  question,
  hint,
  choices,
  disabled,
  onConfirm,
}: {
  questionId: string;
  question?: string;
  hint?: string;
  choices: string[];
  disabled: boolean;
  onConfirm: (picks: string[]) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const toggle = (choice: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(choice)) next.delete(choice);
      else next.add(choice);
      return next;
    });

  return (
    <div className="flex flex-col gap-2.5">
      {question && (
        <p id={questionId} className="text-bubble font-medium text-black-00">
          {question}
        </p>
      )}
      {hint && <p className="text-mid-grey-00 text-sm">{hint}</p>}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={question ? questionId : undefined}
        aria-label={question ? undefined : "Answer choices"}
      >
        {choices.map((c) => {
          const selected = picked.has(c);
          return (
            <button
              aria-pressed={selected}
              className={`rounded-full border-[1.5px] px-3.5 py-1.5 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-teal-00 bg-teal-00 text-white-00"
                  : "border-teal-00 bg-transparent text-teal-00 hover:bg-teal-00/10"
              }`}
              disabled={disabled}
              key={c}
              onClick={() => toggle(c)}
              type="button"
            >
              {c}
            </button>
          );
        })}
      </div>
      <button
        className="self-start rounded-full bg-teal-00 px-4 py-1.5 font-medium text-sm text-white-00 transition-colors hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-mid-grey-00"
        disabled={disabled || picked.size === 0}
        onClick={() => onConfirm(choices.filter((c) => picked.has(c)))}
        type="button"
      >
        Confirm selection
      </button>
    </div>
  );
}

// The model tends to narrate the question as text AND call present_choices.
// Drop a trailing interrogative sentence so the question shows once (as the
// buttons), keeping any lead-in. Without this the text+buttons double-render.
function stripTrailingQuestion(text: string): string {
  return text.replace(/\s*[^.!?\n]*\?\s*$/, "").trimEnd();
}

function BubbleImpl({
  message,
  onChoice,
  onApproval,
  choicesDisabled = false,
  citations,
}: {
  message: UIMessage;
  onChoice: (choice: string) => void;
  onApproval: (id: string, approved: boolean) => void;
  choicesDisabled?: boolean;
  citations?: Citation[];
}) {
  const text = useMemo(
    () => stripLeakedToolCalls(extractText(message)),
    [message],
  );

  const choicesPart = findToolCall(message, "present_choices");
  const askFieldPart = findToolCall(message, "ask_field");
  // present_choices is a no-op server tool: once it resolves, the part lands in
  // "complete". Keep rendering the buttons in that state (they go disabled, not
  // gone, once a later turn lands) — otherwise they flash on then vanish.
  const ready = (part: typeof choicesPart) =>
    part?.state === "input-complete" ||
    part?.state === "approval-requested" ||
    part?.state === "approval-responded" ||
    part?.state === "complete";
  const choicesArgs = ready(choicesPart)
    ? parseChoiceArgs(choicesPart?.arguments)
    : undefined;
  const choices = (choicesArgs?.choices ?? []).filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const hasChoices = choices.length > 0;

  // ask_field renders from the tool RESULT (the canonical field spec from the
  // contract), so it's only available once the no-op server tool completed.
  const askFieldOutput =
    askFieldPart?.state === "complete"
      ? (askFieldPart.output as AskFieldOutput | undefined)
      : undefined;
  const fieldSpec = askFieldOutput?.ok ? askFieldOutput.field : undefined;

  // Keep the lead-in text but drop the trailing question when buttons render it.
  const displayText = useMemo(
    () => (hasChoices || fieldSpec ? stripTrailingQuestion(text) : text),
    [text, hasChoices, fieldSpec],
  );
  const renderedMarkdown = useMemo(() => {
    const normalized = normalizeMarkdown(displayText);
    return annotateCitations(normalized, citations ?? []);
  }, [displayText, citations]);
  const markdownComponents = useMemo(
    () => buildMarkdownComponents(citations ?? []),
    [citations],
  );

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="text-bubble max-w-[75%] rounded-[16px_16px_4px_16px] bg-blue-100 px-4 py-2.5 text-white-00">
          {text}
        </div>
      </div>
    );
  }

  const submitPart = findToolCall(message, "submit_form");
  const submitApproval =
    submitPart?.state === "approval-requested" ? submitPart.approval : null;
  // "Not yet" flips the part to approval-responded/approved=false. Without this
  // the prompt would just vanish, leaving the decline unacknowledged.
  const submitDeclined =
    submitPart?.state === "approval-responded" &&
    submitPart.approval?.approved === false;

  const showText = displayText.length > 0;

  if (
    !showText &&
    !hasChoices &&
    !fieldSpec &&
    !submitApproval &&
    !submitDeclined
  )
    return null;

  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="flex min-w-0 flex-1 rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {showText && (
            <div className="text-bubble text-black-00">
              <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
              >
                {renderedMarkdown}
              </ReactMarkdown>
            </div>
          )}

          {hasChoices && (
            <div className="flex flex-col gap-2.5">
              {choicesArgs?.question && (
                <p
                  id={`choices-q-${message.id}`}
                  className="text-bubble font-medium text-black-00"
                >
                  {choicesArgs.question}
                </p>
              )}
              {/* role=group ties the buttons to the question so screen readers
                  announce them as one labelled set, not loose buttons. */}
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-labelledby={
                  choicesArgs?.question ? `choices-q-${message.id}` : undefined
                }
                aria-label={choicesArgs?.question ? undefined : "Answer choices"}
              >
                {choices.map((c) => (
                  <button
                    className="rounded-full border-[1.5px] border-teal-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-teal-00 transition-colors hover:bg-teal-00 hover:text-white-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-teal-00"
                    disabled={choicesDisabled}
                    key={c}
                    onClick={() => onChoice(c)}
                    type="button"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fieldSpec && (
            <AskFieldWidget
              spec={fieldSpec}
              messageId={message.id}
              disabled={choicesDisabled}
              onAnswer={onChoice}
            />
          )}

          {submitApproval && (
            <div className="flex flex-col gap-2.5">
              <p className="text-bubble font-medium text-black-00">
                Submit your application now?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-teal-00 px-4 py-1.5 font-medium text-sm text-white-00 transition-colors hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-mid-grey-00"
                  disabled={choicesDisabled}
                  onClick={() => onApproval(submitApproval.id, true)}
                  type="button"
                >
                  Submit
                </button>
                <button
                  className="rounded-full border-[1.5px] border-mid-grey-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-mid-grey-00 transition-colors hover:border-black-00 hover:text-black-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={choicesDisabled}
                  onClick={() => onApproval(submitApproval.id, false)}
                  type="button"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          {submitDeclined && (
            <p className="text-bubble text-mid-grey-00 italic">
              Not submitted.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleImpl);
