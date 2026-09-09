import { JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ClientPrimitive } from "@forms/types";

// Renders a non-field content block. Called directly by FieldRenderer, outside
// the TanStack <form.Field> wrapper, so it holds no value and is never
// validated or submitted. Markdown matches the confirmation-copy renderer:
// remark-gfm only, no rehype-raw (raw HTML stays escaped).
export function renderContentElement(field: ClientPrimitive): JSX.Element {
  const body = (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {field.content ?? ""}
    </ReactMarkdown>
  );

  switch (field.variant) {
    case "inset":
      return <div className="govbb-inset-text">{body}</div>;
    // Amber lead-time / risk callout. The glyph is decorative, so assistive
    // tech gets the word instead — same split as ErrorMessage's "Error:".
    case "warning":
      return (
        <div className="govbb-warning-text">
          <span className="govbb-warning-text__icon" aria-hidden="true">
            !
          </span>
          <div className="govbb-warning-text__body">
            <span className="govbb-visually-hidden">Warning:</span>
            {body}
          </div>
        </div>
      );
    case "details":
      return (
        <details className="govbb-show-hide">
          <summary className="govbb-show-hide__summary">
            {field.summary ?? field.label}
          </summary>
          <div className="govbb-show-hide__content">{body}</div>
        </details>
      );
    case "text":
    default:
      return <div className="govbb-content-text">{body}</div>;
  }
}
