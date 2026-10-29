/**
 * The words an element shows: its text without what it hides from sight and from screen readers (aria-hidden), such
 * as the label a Button keeps in reserve to hold its width while it's pending.
 */
export function shownText(element: Element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = "";

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const veil = node.parentElement?.closest('[aria-hidden="true"]');

    if (!veil || !element.contains(veil)) text += node.textContent;
  }

  return text;
}
