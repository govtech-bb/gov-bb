import type { Citation } from "#/lib/rag/types";

// Numbered source badges under an assistant reply. Each maps to a [N] marker in
// the text and links to the official page (text-fragment deep link when set).
export function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="flex max-w-[92%] flex-col gap-1 pl-[42px]">
      <span className="text-disclaimer font-medium text-mid-grey-00">
        Sources
      </span>
      <ol className="flex flex-col gap-0.5">
        {citations.map((c) => (
          <li key={c.number} className="text-disclaimer text-mid-grey-00">
            <span aria-hidden="true">[{c.number}] </span>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-100 underline underline-offset-2"
            >
              {c.title}
              {c.section ? ` — ${c.section}` : ""}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
