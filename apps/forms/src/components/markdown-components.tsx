import React from "react";
import type { Components } from "react-markdown";

// react-markdown renders bare HTML elements (<h2>, <ul>, <a>, …). This app's
// Tailwind preflight reset strips heading sizes/weights and list markers, and
// the gov design system applies typography via utility classes
// (govbb-text-h2, govbb-list--bullet, govbb-link) rather than element
// selectors. Without this mapping a recipe's `## Heading` would render at body
// size. Each entry re-applies the gov class the rest of the app uses for the
// same element. `node` is react-markdown's AST node — dropped so it never
// reaches the DOM.
export const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="govbb-text-h1" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="govbb-text-h2" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="govbb-text-h3" {...props} />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 className="govbb-text-h4" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="govbb-list govbb-list--bullet" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="govbb-list govbb-list--number" {...props} />
  ),
  a: ({ node: _node, ...props }) => <a className="govbb-link" {...props} />,
};
