import {
  captureQuote,
  getSelector,
  locateQuote,
  resolveSelector,
} from "./anchor";
import { WIDGET_CSS } from "./styles";
import { LocalStorageTransport } from "./transport/local-storage";
import type { CommentTransport, MountOptions, Reply, Thread } from "./types";

/**
 * Mount the preview commenting widget. Returns a teardown function that removes
 * all injected UI and event listeners — call it when the host unmounts (e.g.
 * the reviewer leaves preview mode). Safe to call only in the browser.
 *
 * Best-of-both behaviour:
 *   - "Add comment" enters placement mode: hovering outlines the section under
 *     the cursor (Figma-like); click an element to pin a comment there, or
 *     select text first to also store + highlight that exact phrase.
 *   - Pins float at each anchored element and reposition on scroll/resize.
 *   - A right sidebar lists every thread; threads support replies + resolve.
 *   - The commenter names themselves once; the name is remembered locally.
 */
export function mountPreviewComments(options: MountOptions = {}): () => void {
  const rootSelector = options.root ?? "#main";
  // Read the page live, not once at mount: in an SPA the widget is mounted a
  // single time but the route changes underneath it, and each comment must be
  // tagged with the page it was actually made on.
  const currentPage = (): string => options.pageId ?? location.pathname;
  const transport: CommentTransport =
    options.transport ?? new LocalStorageTransport();
  const NAME_KEY = "gtc:preview-comments:author";
  const SCROLL_KEY = "gtc:preview-comments:scrollTo";

  let threads: Thread[] = [];
  let showResolved = false;
  let placing = false;
  let hoverEl: Element | null = null;
  let targetEl: Element | null = null;
  let popover: HTMLElement | null = null;
  let openSelector: string | null = null;
  let rafPending = false;

  const rootEl = (): Element =>
    document.querySelector(rootSelector) ?? document.body;

  const uid = (): string =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  /** Up to two initials for an avatar: "Jane Doe" -> "JD", "Shannon" -> "SH". */
  function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const first = words[0] ?? "";
    if (words.length >= 2) {
      const last = words[words.length - 1] ?? "";
      return (first[0] ?? "") + (last[0] ?? "");
    }
    return first.slice(0, 2) || "?";
  }

  /** A stable avatar colour derived from the name, so each person reads distinct. */
  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) % 360;
    }
    return `hsl(${hash}, 42%, 45%)`;
  }

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    node.setAttribute("data-pc", node.getAttribute("data-pc") ?? "ui");
    return node;
  }

  function isOwnUi(node: EventTarget | null): boolean {
    return node instanceof Element && node.closest("[data-pc]") !== null;
  }

  function authorName(): string {
    return localStorage.getItem(NAME_KEY) ?? "";
  }

  /* ---------- injected UI shell ---------- */

  const style = el("style");
  style.textContent = WIDGET_CSS;
  document.head.appendChild(style);

  const pins = el("div", "pc-pins");
  document.body.appendChild(pins);

  const toolbar = el("div", "pc-toolbar");
  const addBtn = el("button", "pc-btn", "Add comment");
  addBtn.setAttribute("aria-pressed", "false");
  const panelBtn = el("button", "pc-btn");
  panelBtn.innerHTML = 'Comments <span class="pc-count" data-pc="ui">0</span>';
  const countEl = panelBtn.querySelector(".pc-count") as HTMLElement;
  toolbar.appendChild(addBtn);
  toolbar.appendChild(panelBtn);
  document.body.appendChild(toolbar);

  const panel = el("aside", "pc-panel");
  panel.setAttribute("aria-label", "Comments on this page");
  const head = el("div", "pc-head");
  const h2 = el("h2", undefined, "Comments");
  const closeBtn = el("button", undefined, "×");
  closeBtn.setAttribute("aria-label", "Close comments");
  head.appendChild(h2);
  head.appendChild(closeBtn);
  const sub = el("div", "pc-sub");
  const resolvedChk = el("input");
  resolvedChk.type = "checkbox";
  resolvedChk.id = "pc-showres";
  const resolvedLbl = el("label", undefined, "Show resolved");
  resolvedLbl.setAttribute("for", "pc-showres");
  sub.appendChild(resolvedChk);
  sub.appendChild(resolvedLbl);
  const listEl = el("div", "pc-list");
  panel.appendChild(head);
  panel.appendChild(sub);
  panel.appendChild(listEl);
  document.body.appendChild(panel);

  let hint: HTMLElement | null = null;

  /* ---------- panel open/close ---------- */

  const closePanel = (): void => panel.classList.remove("pc-open");

  closeBtn.addEventListener("click", closePanel);
  panelBtn.addEventListener("click", () => {
    panel.classList.toggle("pc-open");
  });
  resolvedChk.addEventListener("change", () => {
    showResolved = resolvedChk.checked;
    render();
  });
  addBtn.addEventListener("click", () => setPlacing(!placing));

  /* ---------- inline highlights ---------- */

  function clearHighlights(): void {
    document.querySelectorAll("mark.pc-hl").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  function highlightThread(thread: Thread): void {
    if (!thread.quote) return;
    const root = rootEl();
    const loc = locateQuote(thread, root);
    if (!loc) return;

    // Walk text nodes, accumulating offsets, and wrap the slice [start,end).
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest("[data-pc]")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let offset = 0;
    const node = walker.nextNode();
    for (let n: Node | null = node; n; n = walker.nextNode()) {
      const len = n.nodeValue?.length ?? 0;
      const segStart = offset;
      const segEnd = offset + len;
      offset = segEnd;
      if (segEnd <= loc.start || segStart >= loc.end) continue;
      const a = Math.max(loc.start, segStart) - segStart;
      const b = Math.min(loc.end, segEnd) - segStart;
      const range = document.createRange();
      try {
        range.setStart(n, a);
        range.setEnd(n, b);
        const mark = el("mark", "pc-hl");
        mark.dataset.thread = thread.id;
        if (thread.resolved) mark.dataset.resolved = "1";
        mark.addEventListener("click", (e) => {
          e.stopPropagation();
          openAnchor(thread.selector, mark);
        });
        range.surroundContents(mark);
      } catch {
        /* selection spans a block boundary — skip this segment */
      }
    }
  }

  /* ---------- pins ---------- */

  /** Group the current page's threads by anchor selector, preserving order. */
  function threadsBySelector(): Map<string, Thread[]> {
    const groups = new Map<string, Thread[]>();
    currentThreads().forEach((thread) => {
      const group = groups.get(thread.selector);
      if (group) group.push(thread);
      else groups.set(thread.selector, [thread]);
    });
    return groups;
  }

  function renderPins(): void {
    pins.innerHTML = "";
    // One numbered pin per anchor; the number is how many comments live there.
    threadsBySelector().forEach((group, selector) => {
      const anchor = resolveSelector(selector);
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const pin = el("button", "pc-pin", String(group.length));
      pin.setAttribute("aria-label", `${group.length} comment(s)`);
      if (group.every((t) => t.resolved)) pin.dataset.resolved = "1";
      pin.style.left = `${rect.right + window.scrollX}px`;
      pin.style.top = `${rect.top + window.scrollY}px`;
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        openAnchor(selector, pin);
      });
      pins.appendChild(pin);
    });
  }

  function scheduleReposition(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderPins();
    });
  }

  /* ---------- placement mode ---------- */

  function setPlacing(on: boolean): void {
    placing = on;
    addBtn.setAttribute("aria-pressed", String(on));
    document.body.classList.toggle("pc-placing", on);
    clearHover();
    if (on) {
      showHint("Select text or click any section to comment. Esc to cancel.");
      document.addEventListener("mousemove", onHoverMove, true);
      document.addEventListener("click", onPlaceClick, true);
    } else {
      hideHint();
      document.removeEventListener("mousemove", onHoverMove, true);
      document.removeEventListener("click", onPlaceClick, true);
    }
  }

  function onHoverMove(e: MouseEvent): void {
    const node = e.target;
    if (
      !(node instanceof Element) ||
      isOwnUi(node) ||
      !rootEl().contains(node)
    ) {
      clearHover();
      return;
    }
    if (node === hoverEl) return;
    clearHover();
    hoverEl = node;
    node.classList.add("pc-hover-outline");
  }

  function clearHover(): void {
    hoverEl?.classList.remove("pc-hover-outline");
    hoverEl = null;
  }

  function onPlaceClick(e: MouseEvent): void {
    if (isOwnUi(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    let quote = "";
    let prefix = "";
    let suffix = "";
    let element: Element | null;

    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      element = rangeElement(range);
      const captured = captureQuote(range, rootEl());
      quote = captured.quote.trim();
      prefix = captured.prefix;
      suffix = captured.suffix;
    } else {
      element = e.target instanceof Element ? e.target : null;
    }

    if (!element || isOwnUi(element)) return;
    const selector = getSelector(element);
    if (!selector) return;

    clearHover();
    setPlacing(false);
    openComposer({ selector, quote, prefix, suffix }, e.pageX, e.pageY);
  }

  function rangeElement(range: Range): Element | null {
    const node = range.commonAncestorContainer;
    return node.nodeType === 1 ? (node as Element) : node.parentElement;
  }

  /* ---------- popovers ---------- */

  function closePopover(): void {
    popover?.remove();
    popover = null;
    openSelector = null;
    targetEl?.classList.remove("pc-target-highlight");
    targetEl = null;
  }

  function placePopover(pop: HTMLElement, x: number, y: number): void {
    document.body.appendChild(pop);
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const maxLeft =
      window.scrollX + document.documentElement.clientWidth - w - 8;
    let top = y + 12;
    if (top + h > window.scrollY + document.documentElement.clientHeight) {
      top = Math.max(window.scrollY + 8, y - h - 12);
    }
    pop.style.left = `${Math.max(window.scrollX + 8, Math.min(x, maxLeft))}px`;
    pop.style.top = `${top}px`;
  }

  function highlightTarget(selector: string): Element | null {
    const node = resolveSelector(selector);
    if (node) {
      node.classList.add("pc-target-highlight");
      targetEl = node;
    }
    return node;
  }

  interface DraftAnchor {
    selector: string;
    quote: string;
    prefix: string;
    suffix: string;
  }

  function openComposer(draft: DraftAnchor, x?: number, y?: number): void {
    closePopover();
    const anchor = highlightTarget(draft.selector);
    if (anchor && x == null) {
      const rect = anchor.getBoundingClientRect();
      x = rect.left + window.scrollX;
      y = rect.bottom + window.scrollY;
    }

    const pop = el("div", "pc-popover");
    const savedName = authorName();
    const quoteHtml = draft.quote
      ? `<div class="pc-quote" data-pc="ui">${escapeHtml(draft.quote)}</div>`
      : "";
    pop.innerHTML =
      `<div class="pc-pop-head" data-pc="ui">` +
      `<h2 data-pc="ui">Add a comment</h2>` +
      `<button type="button" class="pc-close" data-pc="ui" aria-label="Close">×</button></div>` +
      `<div class="pc-pop-body" data-pc="ui">` +
      quoteHtml +
      `<div class="pc-field" data-pc="ui"><label>Your name</label>` +
      `<input type="text" class="pc-name" data-pc="ui" value="${escapeHtml(savedName)}" placeholder="e.g. Jane"></div>` +
      `<div class="pc-field" data-pc="ui"><label>Comment</label>` +
      `<textarea class="pc-text" data-pc="ui" placeholder="Write your comment"></textarea></div>` +
      `<div class="pc-row" data-pc="ui">` +
      `<button type="button" class="pc-action pc-action--secondary pc-cancel" data-pc="ui">Cancel</button>` +
      `<button type="button" class="pc-action pc-action--primary pc-save" data-pc="ui">Save</button></div>` +
      `</div>`;

    popover = pop;
    placePopover(pop, x ?? window.scrollX + 40, y ?? window.scrollY + 40);

    const nameInput = pop.querySelector(".pc-name") as HTMLInputElement;
    const textInput = pop.querySelector(".pc-text") as HTMLTextAreaElement;
    (savedName ? textInput : nameInput).focus();

    pop.querySelector(".pc-close")?.addEventListener("click", closePopover);
    pop.querySelector(".pc-cancel")?.addEventListener("click", closePopover);
    pop.querySelector(".pc-save")?.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const text = textInput.value.trim();
      if (!name) return nameInput.focus();
      if (!text) return textInput.focus();
      localStorage.setItem(NAME_KEY, name);
      const thread: Thread = {
        id: uid(),
        pageId: currentPage(),
        selector: draft.selector,
        quote: draft.quote,
        prefix: draft.prefix,
        suffix: draft.suffix,
        author: name,
        text,
        createdAt: Date.now(),
        resolved: false,
        replies: [],
      };
      void transport.create(thread).then(() => {
        closePopover();
        window.getSelection()?.removeAllRanges();
        return refresh();
      });
    });
  }

  /** Open the popover listing every comment anchored to `selector`. */
  function openAnchor(selector: string, anchorEl: HTMLElement): void {
    closePopover();
    openSelector = selector;
    highlightTarget(selector);

    const pop = el("div", "pc-popover");
    pop.innerHTML =
      `<div class="pc-pop-head" data-pc="ui">` +
      `<h2 data-pc="ui">Comments</h2>` +
      `<button type="button" class="pc-close" data-pc="ui" aria-label="Close">×</button></div>` +
      `<div class="pc-pop-body" data-pc="ui"></div>`;
    popover = pop;

    const body = pop.querySelector(".pc-pop-body") as HTMLElement;
    renderAnchorBody(body, selector);

    const rect = anchorEl.getBoundingClientRect();
    placePopover(pop, rect.right + window.scrollX, rect.top + window.scrollY);
    pop.querySelector(".pc-close")?.addEventListener("click", closePopover);
  }

  function renderAnchorBody(body: HTMLElement, selector: string): void {
    body.innerHTML = "";
    const group = threads.filter((t) => t.selector === selector);
    if (!group.length) {
      body.appendChild(el("p", "pc-empty", "This comment was removed."));
      return;
    }

    group.forEach((thread) => {
      const block = el("div", "pc-thread-block");
      block.appendChild(
        commentEl(thread.author, thread.text, thread.createdAt),
      );
      thread.replies.forEach((r) => {
        block.appendChild(commentEl(r.author, r.text, r.createdAt, true));
      });

      const replyBtn = el("button", "pc-reply-btn", "↳ Reply");
      replyBtn.addEventListener("click", () => showReply(block, thread.id));
      block.appendChild(replyBtn);

      body.appendChild(block);
    });

    const addAnother = el("button", "pc-add-another", "+ Add another comment");
    addAnother.addEventListener("click", () => {
      const anchor = resolveSelector(selector);
      const rect = anchor?.getBoundingClientRect();
      openComposer(
        { selector, quote: "", prefix: "", suffix: "" },
        rect ? rect.left + window.scrollX : undefined,
        rect ? rect.bottom + window.scrollY : undefined,
      );
    });
    body.appendChild(addAnother);
  }

  function showReply(block: HTMLElement, threadId: string): void {
    if (block.querySelector(".pc-reply")) return;
    const wrap = el("div", "pc-reply");
    const textarea = el("textarea");
    textarea.placeholder = "Write a reply";
    const send = el("button", "pc-action pc-action--primary", "Post");
    send.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) return;
      const name = authorName() || "Anonymous";
      const reply: Reply = {
        id: uid(),
        author: name,
        text,
        createdAt: Date.now(),
      };
      void transport.reply(threadId, reply).then(refresh);
    });
    wrap.appendChild(textarea);
    wrap.appendChild(send);
    block.appendChild(wrap);
    textarea.focus();
  }

  /** One comment row: avatar + author/time + body. `reply` indents it. */
  function commentEl(
    author: string,
    text: string,
    ts: number,
    reply = false,
  ): HTMLElement {
    const wrap = el(
      "div",
      reply ? "pc-comment pc-comment--reply" : "pc-comment",
    );
    const avatar = el("div", "pc-avatar", initials(author));
    avatar.style.background = avatarColor(author);
    const main = el("div", "pc-comment__main");
    const meta = el("div", "pc-comment__meta");
    meta.appendChild(el("span", "pc-author", author));
    meta.appendChild(el("span", "pc-time", formatTime(ts)));
    main.appendChild(meta);
    main.appendChild(el("div", "pc-comment__text", text));
    wrap.appendChild(avatar);
    wrap.appendChild(main);
    return wrap;
  }

  /* ---------- sidebar list ---------- */

  function renderPanel(): void {
    listEl.innerHTML = "";
    const visible = visibleThreads();
    if (!visible.length) {
      listEl.appendChild(
        el(
          "div",
          "pc-empty",
          'No comments yet. Click "Add comment", then select text or a section.',
        ),
      );
      return;
    }

    // Group by the page each comment was made on; the page being viewed first.
    const cur = currentPage();
    const groups = new Map<string, Thread[]>();
    visible.forEach((thread) => {
      const list = groups.get(thread.pageId);
      if (list) list.push(thread);
      else groups.set(thread.pageId, [thread]);
    });
    const entries = Array.from(groups.entries()).sort(([a], [b]) =>
      a === cur ? -1 : b === cur ? 1 : a.localeCompare(b),
    );

    entries.forEach(([pageKey, pageThreads]) => {
      const onCurrent = pageKey === cur;
      const group = el("div", "pc-group");
      const groupHead = el(
        "div",
        "pc-group-head",
        onCurrent ? "This page" : pageKey,
      );
      if (onCurrent) groupHead.dataset.current = "1";
      group.appendChild(groupHead);

      pageThreads.forEach((thread) => {
        const box = el("div", "pc-thread");
        box.dataset.thread = thread.id;
        if (thread.resolved) box.dataset.resolved = "1";
        // "Anchor not found" only applies to the page we're actually on; other
        // pages' anchors aren't expected to resolve here.
        const orphan = onCurrent && !resolveSelector(thread.selector);
        if (orphan) box.dataset.orphan = "1";

        if (thread.quote) box.appendChild(el("div", "pc-quote", thread.quote));
        if (orphan) {
          box.appendChild(
            el("div", "pc-orphan-note", "Anchor not found on this page"),
          );
        }
        box.appendChild(
          commentEl(thread.author, thread.text, thread.createdAt),
        );
        thread.replies.forEach((r) => {
          box.appendChild(commentEl(r.author, r.text, r.createdAt, true));
        });

        const resolveBtn = el(
          "button",
          "pc-resolve",
          thread.resolved ? "Reopen" : "Resolve",
        );
        resolveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void transport.setResolved(thread.id, !thread.resolved).then(refresh);
        });
        box.appendChild(resolveBtn);

        box.addEventListener("click", () => jumpTo(thread));
        group.appendChild(box);
      });

      listEl.appendChild(group);
    });
  }

  /**
   * Reveal a thread's anchor. If it's on the current page, scroll to it and
   * flash. If it's on another page, stash the target and navigate there; the
   * widget re-reads the target on the next page and finishes the scroll.
   */
  function jumpTo(thread: Thread): void {
    if (thread.pageId === currentPage()) {
      resolveSelector(thread.selector)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      flash(thread.id);
      return;
    }
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({
          pageId: thread.pageId,
          selector: thread.selector,
          threadId: thread.id,
        }),
      );
    } catch {
      /* sessionStorage unavailable — navigate without the deferred scroll */
    }
    location.assign(thread.pageId);
  }

  /** After landing on a page, finish a jump that was started elsewhere. */
  function checkPendingScroll(): void {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(SCROLL_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let target: { pageId: string; selector: string; threadId: string };
    try {
      target = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(SCROLL_KEY);
      return;
    }
    if (target.pageId !== currentPage()) return;
    const node = resolveSelector(target.selector);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      flash(target.threadId);
    }
    try {
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      /* best effort */
    }
  }

  function flash(threadId: string): void {
    const mark = document.querySelector(
      `mark.pc-hl[data-thread="${threadId}"]`,
    ) as HTMLElement | null;
    if (mark) {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      mark.classList.add("pc-flash");
      setTimeout(() => mark.classList.remove("pc-flash"), 1200);
    }
  }

  /* ---------- shared state + render ---------- */

  /** Threads visible given the show-resolved toggle, across all pages. */
  const visibleThreads = (): Thread[] =>
    threads.filter((t) => showResolved || !t.resolved);

  /** Visible threads anchored on the page currently being viewed. */
  const currentThreads = (): Thread[] =>
    visibleThreads().filter((t) => t.pageId === currentPage());

  function updateCount(): void {
    const open = threads.filter((t) => !t.resolved).length;
    countEl.textContent = String(open);
  }

  function render(): void {
    // Pins and inline highlights are positioned against the live DOM, so they
    // only make sense for comments made on the current page. The sidebar shows
    // every page (see renderPanel).
    clearHighlights();
    currentThreads().forEach(highlightThread);
    renderPins();
    renderPanel();
    updateCount();
  }

  function refresh(): Promise<void> {
    return transport.listAll().then((list) => {
      threads = list ?? [];
      render();
      // Keep an open anchor popover in sync after a create/reply/resolve.
      if (popover && openSelector) {
        const body = popover.querySelector(".pc-pop-body");
        if (body) renderAnchorBody(body as HTMLElement, openSelector);
      }
    });
  }

  /* ---------- global listeners ---------- */

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    if (popover) closePopover();
    else if (placing) setPlacing(false);
  }

  function onDocMousedown(e: MouseEvent): void {
    if (
      popover &&
      !popover.contains(e.target as Node) &&
      !(e.target instanceof Element && e.target.closest(".pc-pin"))
    ) {
      closePopover();
    }
  }

  // SPA route changes: history.pushState/replaceState don't emit events, so we
  // wrap them (and listen for popstate) to re-render for the new page. The new
  // route's DOM may render a tick later, so re-run shortly after as well.
  function onRouteChange(): void {
    closePopover();
    render();
    checkPendingScroll();
    setTimeout(() => {
      render();
      checkPendingScroll();
    }, 120);
  }
  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPushState(...args);
    window.dispatchEvent(new Event("pc:route"));
  };
  history.replaceState = (...args) => {
    origReplaceState(...args);
    window.dispatchEvent(new Event("pc:route"));
  };

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("mousedown", onDocMousedown);
  window.addEventListener("scroll", scheduleReposition, true);
  window.addEventListener("resize", scheduleReposition);
  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("pc:route", onRouteChange);

  void refresh().then(checkPendingScroll);

  /* ---------- teardown ---------- */

  return function teardown(): void {
    setPlacing(false);
    closePopover();
    clearHighlights();
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("mousedown", onDocMousedown);
    window.removeEventListener("scroll", scheduleReposition, true);
    window.removeEventListener("resize", scheduleReposition);
    window.removeEventListener("popstate", onRouteChange);
    window.removeEventListener("pc:route", onRouteChange);
    style.remove();
    pins.remove();
    toolbar.remove();
    panel.remove();
    hint?.remove();
  };

  /* ---------- hint banner ---------- */

  function showHint(message: string): void {
    hideHint();
    hint = el("div", "pc-hint", message);
    document.body.appendChild(hint);
  }
  function hideHint(): void {
    hint?.remove();
    hint = null;
  }

  function escapeHtml(value: string): string {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }
}
