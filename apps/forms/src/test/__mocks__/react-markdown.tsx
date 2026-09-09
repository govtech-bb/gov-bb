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

// Verbatim copy of react-markdown@9's defaultUrlTransform. markdown-components
// imports it to sanitise hrefs, and this alias replaces the whole module, so
// the named export has to exist here too.
export function defaultUrlTransform(value: string): string {
  const colon = value.indexOf(":");
  const questionMark = value.indexOf("?");
  const numberSign = value.indexOf("#");
  const slash = value.indexOf("/");

  if (
    colon < 0 ||
    (slash > -1 && colon > slash) ||
    (questionMark > -1 && colon > questionMark) ||
    (numberSign > -1 && colon > numberSign) ||
    /^(https?|ircs?|mailto|xmpp)$/i.test(value.slice(0, colon))
  ) {
    return value;
  }

  return "";
}
