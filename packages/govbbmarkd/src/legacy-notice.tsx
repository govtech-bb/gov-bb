import type { ReactElement, ReactNode } from "react";

/** @deprecated Retains existing notice styling until an approved design-system equivalent exists; render authored notices through renderMarkdownNodes. */
export function LegacyMarkdownNotice({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  // No inner <p>: MDX already wraps the block child in a styled paragraph (the
  // `p` override). Wrapping again produces invalid nested <p><p>.
  return (
    <div className="border-blue-40 border-l-4 bg-blue-10 px-s py-xm">
      {children}
    </div>
  );
}
