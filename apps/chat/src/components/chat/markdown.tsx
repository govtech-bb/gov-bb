import type { ReactNode } from "react";
import { useState } from "react";
import type { Citation } from "#/lib/chat/types";

const CITATION_HREF_PREFIX = "#citation-";

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function faviconUrl(url: string): string | null {
  try {
    return new URL("/favicon.ico", url).toString();
  } catch {
    return null;
  }
}

// Tiny favicon; falls back to a neutral dot when the icon 404s or the URL is
// unparsable, so a missing favicon never renders a broken-image glyph.
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(url);
  if (!src || failed) {
    return (
      <span aria-hidden="true" className="size-3.5 rounded-full bg-grey-00" />
    );
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="size-3.5 rounded-[3px]"
      height={14}
      onError={() => setFailed(true)}
      src={src}
      width={14}
    />
  );
}

// Claude.ai-style citation chip: a small favicon pill at the end of the
// claim (consecutive markers are grouped into ONE chip by annotateCitations),
// with a hover/focus card listing the cited pages as titled links. No
// hostname text in the prose — the favicon carries the "this is sourced"
// signal and the card carries the detail.
function CitationChip({ citations }: { citations: Citation[] }) {
  const first = citations[0];
  if (!first) return null;
  const label = citations
    .map((c) => (c.section ? `${c.title} — ${c.section}` : c.title))
    .join("; ");
  return (
    <span className="group/cite relative ml-1 inline-flex align-baseline">
      <a
        aria-label={`Sources: ${label}`}
        className="inline-flex items-center gap-1 rounded-full border border-grey-00 bg-white-00 px-1.5 py-0.5 no-underline transition-colors hover:border-mid-grey-00 focus-visible:outline-2 focus-visible:outline-teal-00"
        href={first.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Favicon url={first.url} />
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
        className="invisible absolute bottom-full left-0 z-20 mb-1.5 flex w-64 flex-col gap-1.5 rounded-[8px] border border-grey-00 bg-white-00 p-3 opacity-0 shadow-md transition-opacity group-focus-within/cite:visible group-focus-within/cite:opacity-100 group-hover/cite:visible group-hover/cite:opacity-100"
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
        const nums = href.slice(CITATION_HREF_PREFIX.length).split(",");
        const cited = nums
          .map((n) => byNumber.get(n))
          .filter((c): c is Citation => !!c);
        if (cited.length) return <CitationChip citations={cited} />;
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

// Replace `[N]` markers with anchor links the `a` renderer turns into
// citation chips. A RUN of consecutive markers (`[1][2]`, `[1] [2]`)
// collapses into ONE grouped chip — claude.ai style — instead of a chip per
// marker interrupting the prose.
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
