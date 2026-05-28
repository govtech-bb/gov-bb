import type { UIMessage } from "@tanstack/ai";
import { Allow, parse as parsePartialJson } from "partial-json";
import { memo, type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, findToolCall } from "#/lib/chat/messages";
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
      <span aria-hidden="true" className={`size-3.5 rounded-[3px] ${favColor}`} />
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
      // etc. that a model could emit via prompt injection.
      const safe =
        typeof href === "string" && /^(https?:|mailto:|tel:|#)/i.test(href);
      if (!safe) {
        return <span className="text-teal-00 underline">{children}</span>;
      }
      const external =
        href.startsWith("http://") || href.startsWith("https://");
      return (
        <a
          className="text-teal-00 underline hover:text-teal-100"
          href={href}
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

interface ChoicesArgs {
  question?: string;
  choices?: string[];
}

function parseChoiceArgs(raw: string | undefined): ChoicesArgs | undefined {
  if (!raw) return undefined;
  try {
    return parsePartialJson(raw, Allow.ALL) as ChoicesArgs;
  } catch {
    return undefined;
  }
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
  const text = useMemo(() => extractText(message), [message]);
  const renderedMarkdown = useMemo(() => {
    const normalized = normalizeMarkdown(text);
    return annotateCitations(normalized, citations ?? []);
  }, [text, citations]);
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

  const choicesPart = findToolCall(message, "present_choices");
  const submitPart = findToolCall(message, "submit_form");
  const submitApproval =
    submitPart?.state === "approval-requested" ? submitPart.approval : null;

  const choicesReady =
    choicesPart?.state === "input-complete" ||
    choicesPart?.state === "approval-requested" ||
    choicesPart?.state === "approval-responded";
  const choicesArgs = choicesReady
    ? parseChoiceArgs(choicesPart?.arguments)
    : undefined;
  const choices = (choicesArgs?.choices ?? []).filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const hasChoices = choices.length > 0;

  const showText = text.length > 0 && !choicesPart;

  if (!showText && !hasChoices && !submitApproval) return null;

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
                <p className="text-bubble font-medium text-black-00">
                  {choicesArgs.question}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
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
        </div>
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleImpl);
