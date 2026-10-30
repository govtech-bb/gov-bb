import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode } from "lexical";
import { useEffect } from "react";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import type { InternalPageLink } from "../pages/link-checks";

/** What the page's links need from the author: the broken ones, or that they couldn't be checked. */
export type LinkWarningProps = {
  broken: readonly InternalPageLink[];
  /** The pages couldn't be listed, so no link is called broken. */
  unavailable: boolean;
  retrying: boolean;
  onRetry: () => void;
};

/** Each broken link by its words; choosing one takes the author to it in the page. */
export function LinkWarnings({
  broken,
  unavailable,
  retrying,
  onRetry,
  onSelect,
}: LinkWarningProps & { onSelect: (path: readonly number[]) => void }) {
  if (unavailable)
    return (
      <Banner
        tone="warning"
        layout="strip"
        actions={
          <Button variant="secondary" pending={retrying} onClick={onRetry}>
            Check again
          </Button>
        }
      >
        We could not check this page’s links. Your changes are kept, and you can still save.
      </Banner>
    );

  if (!broken.length) return null;

  return (
    <Banner
      tone="warning"
      layout="strip"
      title={
        broken.length === 1
          ? "This link goes to a page that doesn’t exist"
          : `${broken.length} links go to pages that don’t exist`
      }
    >
      <ul className="mt-1 flex max-h-48 flex-col overflow-y-auto">
        {broken.map((link) => (
          <li key={link.path.join(".")} className="flex flex-wrap items-center gap-x-2">
            {/* The link style has no touch target of its own: 44px tall, wrapping a long label */}
            <Button
              variant="link"
              className="min-h-11 max-w-full touch-manipulation py-2 wrap-anywhere whitespace-normal"
              onClick={() => onSelect(link.path)}
            >
              {link.text}
            </Button>
            <span className="font-mono text-12 wrap-anywhere text-muted">{link.url}</span>
          </li>
        ))}
      </ul>
    </Banner>
  );
}

/** Puts the caret in the link at `path` and scrolls it into view, once the page is being written. */
export function LinkSelection({
  path,
  ready,
  onDone,
}: {
  path?: readonly number[];
  ready: boolean;
  onDone: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!path || !ready) return;
    let cancelled = false;

    // After the page is editable again, which settles in this same commit
    queueMicrotask(() => {
      if (cancelled) return;
      let key: string | undefined;

      // Focus first: it would otherwise put the caret back at the start of the page
      editor.focus();

      editor.update(
        () => {
          let node: LexicalNode | null = $getRoot();

          for (const index of path)
            node = $isElementNode(node) ? node.getChildAtIndex(index) : null;

          if ($isElementNode(node)) {
            // Inside the link's words, so the caret is in the link rather than beside it
            const first = node.getFirstDescendant();

            if ($isTextNode(first)) first.select(0, 0);
            else node.selectStart();
            key = node.getKey();
          }
        },
        { discrete: true },
      );

      if (key) editor.getElementByKey(key)?.scrollIntoView?.({ block: "center" });
      onDone();
    });

    return () => {
      cancelled = true;
    };
  }, [editor, path, ready, onDone]);

  return null;
}
