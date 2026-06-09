import type { InferToolInput, InferToolOutput, UIMessage } from "@tanstack/ai";
import type { Primitive } from "@govtech-bb/form-types";
import { validateField } from "@govtech-bb/form-validation";
import {
  Button,
  Checkbox,
  DateInput,
  type DateInputValue,
  Input,
  TextArea,
} from "@govtech-bb/react";
import { Allow, parse as parsePartialJson } from "partial-json";
import { memo, type ReactNode, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askFieldDef, presentChoicesDef } from "#/lib/chat-tools";
import { getSessionThreadId } from "#/lib/chat/persistence";
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

const PILL_BTN =
  "rounded-full border-[1.5px] border-teal-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-teal-00 transition-colors hover:bg-teal-00 hover:text-white-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-teal-00";

// Run the SAME validation engine the forms app uses, client-side, before the
// answer is ever sent — a bad value swaps the hint for the error message in
// this bubble instead of spawning an error turn. The server-side set_field
// validation stays as the backstop (cross-field rules need the full session).
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

  let widget: ReactNode;
  if (options.length > 0 && (spec.htmlType === "checkbox" || spec.multiple)) {
    widget = (
      <CheckboxAnswer disabled={disabled} onAnswer={onAnswer} spec={spec} />
    );
  } else if (options.length > 0) {
    widget = (
      <div className="flex flex-col gap-2.5">
        <HintOrError hint={spec.hint} error={null} />
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-labelledby={questionId}
        >
          {options.map((o) => (
            <button
              className={PILL_BTN}
              disabled={disabled}
              key={o.value}
              onClick={() => onAnswer(o.label)}
              type="button"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (spec.htmlType === "checkbox") {
    widget = (
      <BooleanAnswer disabled={disabled} onAnswer={onAnswer} spec={spec} />
    );
  } else if (spec.htmlType === "date") {
    widget = (
      <DateAnswer disabled={disabled} onAnswer={onAnswer} spec={spec} />
    );
  } else if (spec.htmlType === "file") {
    widget = (
      <FileAnswer disabled={disabled} onAnswer={onAnswer} spec={spec} />
    );
  } else {
    widget = (
      <TextAnswer disabled={disabled} onAnswer={onAnswer} spec={spec} />
    );
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

// Forms-parity checkbox list (declarations, multi-option checkbox fields,
// multi-selects): real checkboxes with the EXACT contract wording, then
// confirm. Picks go back as ONE comma-separated user message.
function CheckboxAnswer({
  spec,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
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
            disabled={disabled}
            key={o.value}
            label={o.label}
            onCheckedChange={() => toggle(o.value)}
          />
        ))}
      </div>
      <Button disabled={disabled} onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}

// Boolean checkbox (no options) — a consent/yes-no toggle. A required rule
// means it must be ticked, which the client-side engine reports in place.
function BooleanAnswer({
  spec,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
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
        disabled={disabled}
        label="Yes"
        onCheckedChange={() => {
          setError(null);
          setChecked((c) => !c);
        }}
      />
      <Button disabled={disabled} onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}

function TextAnswer({
  spec,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    const err = validateSpecValue(
      spec,
      spec.htmlType === "number" ? Number(trimmed) : trimmed,
    );
    if (err) {
      setError(err);
      return;
    }
    onAnswer(trimmed);
  };
  const change = (next: string) => {
    setError(null);
    setValue(next);
  };

  if (spec.htmlType === "textarea") {
    return (
      <div className="flex flex-col gap-2.5">
        <HintOrError hint={spec.hint} error={error} />
        <TextArea
          aria-label={spec.label}
          className="bg-white-00 text-black-00"
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          rows={3}
          value={value}
        />
        <Button disabled={disabled || !trimmed} onClick={submit} type="button">
          Continue
        </Button>
      </div>
    );
  }

  const inputType =
    spec.htmlType === "email" ||
    spec.htmlType === "tel" ||
    spec.htmlType === "number"
      ? spec.htmlType
      : "text";
  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      <div className="flex items-end gap-2">
        <Input
          aria-label={spec.label}
          className="flex-1 bg-white-00 text-black-00"
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          type={inputType}
          value={value}
        />
        <Button disabled={disabled || !trimmed} onClick={submit} type="button">
          Continue
        </Button>
      </div>
    </div>
  );
}

// GOV-style day/month/year input; answers as ISO YYYY-MM-DD, the shape the
// server's date coercion parses. Date rules (past, after/before) run in the
// engine on Continue, so "needs to be in the past" appears here, not as a
// new chat turn.
function DateAnswer({
  spec,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
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
        disabled={disabled}
        name={spec.fieldId}
        onChange={(next) => {
          setError(null);
          setDate(next);
        }}
        value={date}
      />
      <Button disabled={disabled || !complete} onClick={submit} type="button">
        Continue
      </Button>
    </div>
  );
}

// In-bubble file upload. presign + confirm go through /api/form-file (the
// forms API's CORS excludes the chat origin, so the server brokers both and
// writes the verified ref into the form session); only the S3 PUT runs from
// the browser. Continue just tells the model the upload happened — the value
// is already recorded server-side.
function FileAnswer({
  spec,
  disabled,
  onAnswer,
}: {
  spec: FieldSpec;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    const precheck = validateSpecValue(spec, [
      { name: file.name, size: file.size, type: file.type },
    ]);
    if (precheck) {
      setError(precheck);
      return;
    }
    setBusy(true);
    try {
      const threadId = getSessionThreadId();
      const presignRes = await fetch("/api/form-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presign",
          threadId,
          fieldId: spec.fieldId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      if (!presignRes.ok) {
        const body = (await presignRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload failed. Please try again.");
      }
      const { data: presign } = (await presignRes.json()) as {
        data: { uploadUrl: string; key: string };
      };

      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed. Please try again.");

      const confirmRes = await fetch("/api/form-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          threadId,
          fieldId: spec.fieldId,
          key: presign.key,
        }),
      });
      if (!confirmRes.ok) throw new Error("Upload failed. Please try again.");

      setUploaded((u) => [...u, file.name]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <HintOrError hint={spec.hint} error={error} />
      {uploaded.map((name) => (
        <p className="text-bubble text-black-00" key={name}>
          ✓ {name}
        </p>
      ))}
      <input
        aria-label={spec.label}
        className="text-bubble text-black-00 file:mr-3 file:rounded-full file:border-0 file:bg-teal-00 file:px-3.5 file:py-1.5 file:font-medium file:text-sm file:text-white-00 disabled:opacity-50"
        disabled={disabled || busy}
        multiple={spec.multiple}
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) void upload(f);
          e.target.value = "";
        }}
        type="file"
      />
      <Button
        disabled={disabled || busy || uploaded.length === 0}
        onClick={() =>
          onAnswer(
            `Uploaded ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}: ${uploaded.join(", ")}`,
          )
        }
        type="button"
      >
        Continue
      </Button>
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
  // Once a later turn lands the field has been answered (the answer is the
  // next user bubble) — the widget disappears entirely, leaving only the
  // model's lead-in text. fieldSpec still drives the trailing-question strip
  // so the bubble text doesn't reflow when the widget goes.
  const showField = !!fieldSpec && !choicesDisabled;

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
    !showField &&
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

          {showField && fieldSpec && (
            <AskFieldWidget
              spec={fieldSpec}
              messageId={message.id}
              disabled={false}
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
