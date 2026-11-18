import type { ReactNode } from "react";
import { Heading } from "@govtech-bb/react";

/** @deprecated Retains existing highlights HTML; no replacement directive is approved. */
export function Highlights({ children }: { children: ReactNode }) {
  return (
    <ul className="grid list-none grid-cols-1 gap-s p-0 sm:grid-cols-2">
      {children}
    </ul>
  );
}

/** @deprecated Retains existing highlight HTML; use ordinary Markdown headings and prose for new content. */
export function Highlight({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-xxs bg-teal-10 p-s">
      <Heading as="h4" size="h3">
        {title}
      </Heading>
      {children}
    </li>
  );
}
