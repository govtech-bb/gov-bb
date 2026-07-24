import React from "react";

// react-markdown is ESM-only and its transitive dependency tree (micromark,
// unified, mdast/hast, …) is large and brittle to whitelist in ts-jest's
// transformIgnorePatterns. Parsing markdown to HTML is the library's
// responsibility (covered by its own tests and by our build/smoke runs); our
// component tests only need to confirm the content is passed through and
// rendered. This passthrough renders the raw markdown string so tests can
// assert on its text.
export default function ReactMarkdown({
  children,
}: {
  children?: React.ReactNode;
  remarkPlugins?: unknown[];
}) {
  return <div data-testid="react-markdown">{children}</div>;
}
