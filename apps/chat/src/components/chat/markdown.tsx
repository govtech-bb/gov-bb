import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkVariants } from "@govtech-bb/react";
import type { Citation } from "#/lib/rag/types";

// Assistant replies are markdown. Mirrors the ts-react-chat example's text-part
// rendering (ReactMarkdown + remark-gfm) and keeps Tailwind Typography's `prose`
// styling for the body (base size, not prose-sm). We omit rehype-raw so any raw
// HTML in model output is escaped rather than injected (safe by default).
//
// `[N]` citation markers are rendered as inline coat-of-arms chips (claude.ai
// style), the way the old app did — see CitationChip / annotateCitations.

const CITATION_HREF_PREFIX = "#citation-";

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

// A small coat-of-arms pill at the end of a claim (consecutive markers grouped
// into ONE chip by annotateCitations), with a hover/focus card listing the
// cited pages. Every source is an alpha.gov.bb page, so the chip carries the
// coat of arms — the mark the header uses — rather than a fetched favicon.
// `not-prose` opts the chip out of the surrounding prose link styling.
function CitationChip({ citations }: { citations: Citation[] }) {
  const first = citations[0];
  if (!first) return null;
  const label = citations
    .map((c) => (c.section ? `${c.title} — ${c.section}` : c.title))
    .join("; ");
  return (
    <span className="not-prose group/cite relative ml-1 inline-flex align-baseline">
      <a
        aria-label={`Sources: ${label}`}
        className="inline-flex items-center gap-1 rounded-full border border-grey-00 bg-white-00 px-1.5 py-0.5 no-underline transition-colors hover:border-mid-grey-00 focus-visible:outline-2 focus-visible:outline-teal-00"
        href={first.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <img
          alt=""
          aria-hidden="true"
          className="size-3.5"
          height={14}
          src="/coat-of-arms.png"
          width={14}
        />
        {citations.length > 1 && (
          <span className="font-medium text-[10px] text-mid-grey-00 leading-none">
            +{citations.length - 1}
          </span>
        )}
      </a>
      {/* Hover/focus source card — pure CSS, no portal. Hidden from the
          accessibility tree: the chip's aria-label already names the sources
          and the card's links duplicate the chip's hrefs. */}
      <span
        aria-hidden="true"
        className="invisible absolute bottom-full left-0 z-20 mb-1.5 flex w-64 flex-col gap-1.5 rounded-lg border border-grey-00 bg-white-00 p-3 opacity-0 shadow-md transition-opacity group-focus-within/cite:visible group-focus-within/cite:opacity-100 group-hover/cite:visible group-hover/cite:opacity-100"
      >
        {citations.map((c) => (
          <a
            className="flex flex-col no-underline"
            href={c.url}
            key={c.number}
            rel="noopener noreferrer"
            tabIndex={-1}
            target="_blank"
          >
            <span className="font-medium text-black-00 text-xs leading-snug hover:underline">
              {c.title}
            </span>
            <span className="text-[10px] text-mid-grey-00">
              {c.section ? `${c.section} · ` : ""}
              {sourceHost(c.url)}
            </span>
          </a>
        ))}
      </span>
    </span>
  );
}

// Replace `[N]` markers with anchor links the `a` renderer turns into citation
// chips. A RUN of consecutive markers (`[1][2]`, `[1] [2]`) collapses into ONE
// grouped chip — claude.ai style — instead of a chip per marker.
export function annotateCitations(text: string, citations: Citation[]): string {
  if (!citations.length) return text;
  const valid = new Set(citations.map((c) => c.number));
  return text.replace(/\[(\d+)\](?:\s*\[(?:\d+)\])*/g, (run) => {
    const nums = [...run.matchAll(/\[(\d+)\]/g)]
      .map((m) => m[1] as string)
      .filter((n) => valid.has(n));
    if (!nums.length) return run;
    const unique = [...new Set(nums)];
    return `[​](${CITATION_HREF_PREFIX}${unique.join(",")})`;
  });
}

export function Markdown({
  children,
  citations = [],
}: {
  children: string;
  citations?: Citation[];
}) {
  const text = annotateCitations(children, citations);
  const byNumber = new Map(citations.map((c) => [c.number, c]));
  const components = {
    a: ({ children, href }: { children?: ReactNode; href?: string }) => {
      if (typeof href === "string" && href.startsWith(CITATION_HREF_PREFIX)) {
        const cited = href
          .slice(CITATION_HREF_PREFIX.length)
          .split(",")
          .map((n) => byNumber.get(n))
          .filter((c): c is Citation => !!c);
        if (cited.length) return <CitationChip citations={cited} />;
      }
      // Only allow safe URL schemes — block javascript:, data:, vbscript:, etc.
      // a model could emit via prompt injection. Trim first: browsers ignore
      // leading whitespace before the scheme, so " javascript:" must not slip
      // past the allowlist. Styling comes from the design-system link.
      const trimmed = typeof href === "string" ? href.trim() : "";
      const safe = /^(https?:|mailto:|tel:|#)/i.test(trimmed);
      if (!safe) return <span>{children}</span>;
      const external = /^https?:/i.test(trimmed);
      return (
        <a
          href={trimmed}
          className={linkVariants()}
          rel={external ? "noopener noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          {children}
        </a>
      );
    },
  };
  return (
    <div className="prose prose-bubble max-w-none prose-p:my-1.5 prose-headings:my-2 prose-pre:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
