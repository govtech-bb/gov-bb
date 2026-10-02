import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";
import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming";
import { MarkdownCodeBlock } from "./code-block";

const extensions = [streamingMarkdownExtension()];
const components: MarkdownComponents = {
  pre: MarkdownCodeBlock,
  a: ({ href, children }) => (
    <a
      href={
        href &&
        /^(https?:|mailto:|tel:|\/)/i.test(href) &&
        !href.startsWith("//")
          ? href
          : undefined
      }
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt ? "Image: " + alt : "Image omitted"}</span>,
};

export function StreamingText({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div
      data-streaming={streaming}
      className="min-inline-0 text-[13px] leading-[1.75] wrap-anywhere data-[streaming=true]:[&>p:nth-last-child(2)]:inline [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_p]:my-3 [&_:where(h1,h2,h3,h4)]:mt-5 [&_:where(h1,h2,h3,h4)]:mb-2 [&_:where(h1,h2,h3,h4)]:text-[15px] [&_:where(h1,h2,h3,h4)]:font-semibold [&_:where(h1,h2,h3,h4)]:leading-[1.4] [&_:where(ul,ol)]:my-3 [&_:where(ul,ol)]:ps-5 [&_li]:my-1 [&_:where(pre,table)]:max-inline-full [&_:where(pre,table)]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-ui-recessed [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:border-collapse [&_:where(th,td)]:border [&_:where(th,td)]:border-ui-hairline [&_:where(th,td)]:px-3 [&_:where(th,td)]:py-2 [&_th]:bg-ui-tint [&_th]:text-start [&_a]:text-inherit [&_a]:underline [&_a]:decoration-ui-subtle [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-s-2 [&_blockquote]:border-ui-line [&_blockquote]:ps-3 [&_blockquote]:text-ui-subtle"
    >
      <Markdown
        extensions={extensions}
        frontmatter={false}
        headingIds={false}
        allowHtml={false}
        components={components}
      >
        {content}
      </Markdown>
      {streaming && (
        <span
          aria-hidden="true"
          data-streaming-cursor
          className="ms-0.5 inline-block block-3.5 inline-0.5 rounded-full bg-ui-subtle align-middle motion-safe:animate-pulse"
        />
      )}
    </div>
  );
}
