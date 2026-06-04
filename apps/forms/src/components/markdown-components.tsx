import type { Components } from "react-markdown";

// react-markdown renders bare HTML elements (<h2>, <ul>, <a>, …). This app's
// Tailwind preflight reset strips heading sizes/weights and list markers, and
// the gov design system applies typography via utility classes
// (govbb-text-h2, govbb-list--bullet, govbb-link) rather than element
// selectors. Without this mapping a recipe's `## Heading` would render at body
// size. Each entry re-applies the gov class the rest of the app uses for the
// same element.
//
// We forward only `children` (and `href` for links) rather than spreading
// react-markdown's full prop bag: that bag is typed `ComponentProps<Tag> &
// ExtraProps` (ref, key, the AST node, …) and spreading it onto a bare
// intrinsic element fails React 19's strict JSX types under `tsc -b`. The
// dropped attributes (heading anchor ids, etc.) aren't needed for confirmation
// copy.
export const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="govbb-text-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="govbb-text-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="govbb-text-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="govbb-text-h4">{children}</h4>,
  ul: ({ children }) => (
    <ul className="govbb-list govbb-list--bullet">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="govbb-list govbb-list--number">{children}</ol>
  ),
  a: ({ children, href }) => (
    <a className="govbb-link" href={href}>
      {children}
    </a>
  ),
};
