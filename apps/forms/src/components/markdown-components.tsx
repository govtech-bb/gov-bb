import { Heading, Link, List, Text } from "@govtech-bb/react";
import { defaultUrlTransform, type Components } from "react-markdown";

// react-markdown blanks the href of any protocol outside its safe list, which
// covers mailto: but not tel: — a recipe that links a phone number would render
// `<a href="">`. Let tel: through and defer to the default for everything else,
// so javascript: and friends are still stripped.
export function markdownUrlTransform(url: string): string {
  return url.startsWith("tel:") ? url : defaultUrlTransform(url);
}

// Keep Markdown attributes while excluding react-markdown's AST node.
export const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => <Heading as="h1" {...props} />,
  h2: ({ node: _node, ...props }) => <Heading as="h2" {...props} />,
  h3: ({ node: _node, ...props }) => <Heading as="h3" {...props} />,
  h4: ({ node: _node, ...props }) => <Heading as="h4" {...props} />,
  p: ({ node: _node, ...props }) => <Text {...props} />,
  ul: ({ node: _node, ...props }) => <List variant="bullet" {...props} />,
  ol: ({ node: _node, ...props }) => <List variant="number" {...props} />,
  a: ({ node: _node, ...props }) => <Link {...props} />,
};
