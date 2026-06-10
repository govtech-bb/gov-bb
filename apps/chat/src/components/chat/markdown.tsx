import type { ReactNode } from "react";
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

export function buildMarkdownComponents(citations: Citation[]) {
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
export function annotateCitations(text: string, citations: Citation[]): string {
  if (!citations.length) return text;
  const valid = new Set(citations.map((c) => c.number));
  return text.replace(/\[(\d+)\]/g, (match, num) =>
    valid.has(num) ? `[${match}](${CITATION_HREF_PREFIX}${num})` : match,
  );
}
