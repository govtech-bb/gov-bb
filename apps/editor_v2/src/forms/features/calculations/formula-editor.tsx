import { Tooltip } from "@base-ui/react/tooltip";
import { Hash, MagnifyingGlass, TextT } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../cn";
import { ItemLabel, item, sectionLabel } from "../../../ui/item";
import { Tip } from "../../../ui/tooltip";
import {
  fieldRefs,
  formulaText,
  operatorType,
  parseFormula,
  quote,
  tokenizeFormula,
  type FormulaError,
  type Token,
} from "../../core/formula";
import { type Field } from "../logic/queries";
import { useSettled, useOutside, useEscape, useEditable } from "../../react/logic-hooks";
import { fieldIcon } from "../../react/logic-pickers";

export const failure = (result: ReturnType<typeof parseFormula>) =>
  "error" in result ? result : null;

export const cut = (text: string, length = 36) =>
  text.length > length ? `${text.slice(0, length - 3)}...` : text;

// Operators as the pill and the editor show them (r6, rm)
export const pillSigns: Partial<Record<Token["type"], string>> = {
  PLUS: "+",
  MINUS: "−",
  MULTIPLY: "×",
  DIVIDE: "/",
  LPAREN: "(",
  RPAREN: ")",
};

export const atomSigns: Partial<Record<Token["type"], string>> = {
  MINUS: "−",
  MULTIPLY: "×",
  DIVIDE: "÷",
};

export const wavy = "underline decoration-error decoration-wavy decoration-1 underline-offset-3";

export const formulaOf = (expression: string, fields: Field[]) =>
  expression.replace(
    fieldRefs,
    (_, key: string) => `@${fields.find((f) => f.key === key)?.title ?? key.slice(0, 8)}`,
  );

/** Calculated fields are listed first; text formulas can also reference submission metadata. */
export function formulaFields(fields: Field[], type: "NUMBER" | "TEXT") {
  const rank = { CALCULATED_FIELD: 0, INPUT_FIELD: 1, METADATA: 3 };

  return fields
    .filter((f) => {
      if (f.type === "INPUT_FIELD") {
        return f.capabilities?.formula ?? false;
      }

      return f.type === "CALCULATED_FIELD"
        ? type === "TEXT" || f.kind === "NUMBER"
        : type === "TEXT" && f.type === "METADATA";
    })
    .sort((a, b) => rank[a.type] - rank[b.type]);
}

export const matchesQuery = (title: string, query: string) =>
  !query ||
  query
    .toLowerCase()
    .split(" ")
    .every((w) => title.toLowerCase().includes(w.trim()));

export const sectionTitles = {
  CALCULATED_FIELD: "Mention a calculated field",
  INPUT_FIELD: "Mention an input field",
  METADATA: "Mention metadata",
};

/** Debounce validation so incomplete formulas are not marked invalid on every keystroke. */
export function FormulaPill({
  expression,
  fields,
  type,
  onChange,
}: {
  expression: string;
  fields: Field[];
  type: "NUMBER" | "TEXT";
  onChange: (expression: string) => void;
}) {
  const editable = useEditable();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!editable) setOpen(false);
  }, [editable]);
  const [place, setPlace] = useState<{ root: Element; top: number } | null>(null);
  const [truncated, setTruncated] = useState(false);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const tokens = useMemo(() => tokenizeFormula(expression), [expression]);
  const checked = useSettled(expression, 300);

  const error = useMemo(
    () => (checked.trim() ? failure(parseFormula(checked, type)) : null),
    [checked, type],
  );

  useEffect(() => {
    const el = button.current;

    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [tokens, byKey]);
  useEffect(() => {
    const el = button.current;
    const root = el?.closest("[data-logic-editor-root]");

    if (open && el && root)
      setPlace({
        root,
        top: el.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 6,
      });
  }, [open]);

  const bad =
    error && !Array.isArray(error.at) && tokens?.length
      ? Math.min(error.at, tokens.length - 1)
      : -1;

  const chip = (key: string, at: number | string, wrong = false) => {
    const field = byKey.get(key);
    const name = field ? field.title : key.slice(0, 8);

    return (
      <span
        key={at}
        title={name}
        className={cn(
          "inline-flex h-4.5 items-center gap-0.5 rounded-sm bg-grey-30 px-1.5 text-14 font-medium whitespace-nowrap text-ink [&_svg]:size-2.5",
          wrong && wavy,
        )}
      >
        {field && fieldIcon(field)}
        {cut(name)}
      </span>
    );
  };

  const token = (text: string, at: number | string, highlight = false, wrong = false) => (
    <span
      key={at}
      className={cn(
        "text-14 whitespace-nowrap",
        highlight ? "font-medium text-interactive" : "font-normal text-ink",
        wrong && cn(wavy, "text-error"),
      )}
    >
      {text}
    </span>
  );

  // Text that doesn't tokenize shows as typed, its fields as chips and the characters at fault underlined
  const raw = () => {
    const range = error && Array.isArray(error.at) ? error.at : null;
    const out: ReactNode[] = [];

    const text = (s: string, from: number) => {
      if (!s) return;

      if (!range || range[1] <= from || range[0] >= from + s.length)
        return void out.push(token(s, from));
      const a = Math.max(0, range[0] - from);
      const b = Math.min(s.length, range[1] - from);
      out.push(
        <span key={from} className="text-14 whitespace-nowrap text-ink">
          {s.slice(0, a)}
          {token(s.slice(a, b), "error", false, true)}
          {s.slice(b)}
        </span>,
      );
    };

    let at = 0;

    for (const m of expression.matchAll(fieldRefs)) {
      text(expression.slice(at, m.index), at);
      out.push(chip(m[1]!, `ref-${m.index}`));
      at = m.index + m[0].length;
    }

    text(expression.slice(at), at);

    return out;
  };

  return (
    <span className="inline-flex min-w-0">
      <button
        data-logic-pill=""
        ref={button}
        type="button"
        aria-label="Edit formula"
        onClick={() => editable && setOpen(true)}
        className={cn(
          "relative inline-flex h-7 max-w-160 min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm border border-line bg-tint px-2 text-14 leading-none font-normal text-ink -outline-offset-1 outline-focus focus-visible:outline-4 pointer-fine:hover:bg-line",
          truncated &&
            "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-linear-to-r after:from-transparent after:to-grey-10 pointer-fine:hover:after:to-grey-20",
        )}
      >
        {!!tokens?.length && (
          <span className="text-14 font-semibold whitespace-nowrap text-ink">=</span>
        )}
        {tokens === null && raw()}
        {tokens?.length === 0 && (
          <span className="text-14 font-semibold whitespace-nowrap text-subtle">
            Type a formula
          </span>
        )}
        {tokens?.map((t, i) =>
          t.type === "FIELD_REF"
            ? chip(t.value, i, i === bad)
            : t.type === "STRING"
              ? token(`"${t.value}"`, i, true, i === bad)
              : token(pillSigns[t.type] ?? t.value, i, t.type === "NUMBER", i === bad),
        )}
      </button>
      {open &&
        editable &&
        place &&
        createPortal(
          <div className="absolute inset-x-0 h-0" style={{ top: place.top }}>
            <EditFormula
              expression={expression}
              fields={fields}
              type={type}
              onChange={onChange}
              onClose={() => {
                setOpen(false);
                setPlace(null);
                button.current?.focus();
              }}
            />
          </div>,
          place.root,
        )}
    </span>
  );
}

export function EditFormula({
  expression,
  fields,
  type,
  onChange,
  onClose,
}: {
  expression: string;
  fields: Field[];
  type: "NUMBER" | "TEXT";
  onChange: (expression: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const editor = useRef<FormulaEditorHandle>(null);
  const title = useId();
  useOutside(menu, onClose);
  useEscape(onClose);

  return (
    <div ref={menu} className="absolute inset-x-0 top-full z-1000 rounded-sm bg-white shadow-popup">
      <div className="relative w-full p-3">
        <div className="mb-3 text-14 font-semibold">
          <span id={title}>Edit formula</span>
        </div>
        <FormulaEditor
          ref={editor}
          expression={expression}
          fields={fields}
          type={type}
          onChange={onChange}
          labelledBy={title}
        />
        <FormulaFooter
          type={type}
          onInsert={(key) =>
            editor.current?.insertTokens([
              key === '"'
                ? { type: "STRING", value: "" }
                : { type: operatorType(key)!, value: key },
            ])
          }
          onMention={() => editor.current?.startMention()}
        />
      </div>
    </div>
  );
}

export const numberKeys = [
  ["+", "+", "Add"],
  ["−", "-", "Subtract"],
  ["×", "*", "Multiply"],
  ["÷", "/", "Divide"],
  ["(", "(", "Open group"],
  [")", ")", "Close group"],
] as const;

export const textKeys = [
  ['"', '"', "Add text"],
  ["+", "+", "Join text"],
] as const;

/** Keep the editor focused so inserting an operator preserves its selection. */
export function OperatorButton({
  tip,
  onClick,
  children,
}: {
  tip: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tip content={tip}>
      <button
        type="button"
        aria-label={tip}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-sm bg-tint p-0 text-12 font-semibold text-muted transition-[background-image] select-none hover:bg-[linear-gradient(rgb(0_0_0/0.04),rgb(0_0_0/0.04))]"
      >
        {children}
      </button>
    </Tip>
  );
}

export function FormulaFooter({
  type,
  onInsert,
  onMention,
}: {
  type: "NUMBER" | "TEXT";
  onInsert: (key: string) => void;
  onMention: () => void;
}) {
  return (
    <div className="mt-3 flex min-h-6 items-center justify-between gap-3">
      <div className="text-12 text-muted">
        <OperatorButton tip="Reference a field" onClick={onMention}>
          @
        </OperatorButton>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {(type === "TEXT" ? textKeys : numberKeys).map(([label, key, tip]) => (
          <OperatorButton key={label} tip={tip} onClick={() => onInsert(key)}>
            {label}
          </OperatorButton>
        ))}
      </div>
    </div>
  );
}

// Fields and operators are atomic DOM nodes; numbers and strings remain editable text.
export type Labels = (key: string) => { label: string; field?: Field };

export type Icons = (field?: Field) => Node | undefined;

export const spacer = "​";

export const unspaced = (text: string) => text.replace(/​/g, "");

// Safari and Firefox need zero-width spaces beside atoms to place the caret there.
export const spacers =
  typeof navigator !== "undefined" &&
  (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
    /firefox/i.test(navigator.userAgent));

export const errorRun = "data-error-run";

export const iconId = (field?: Field) => (field ? `${field.type}-${field.kind}` : "deleted");

export function fieldAtom(key: string, labels: Labels, icons: Icons) {
  const { label, field } = labels(key);
  const atom = document.createElement("span");
  atom.dataset.atom = "field";
  atom.dataset.uuid = key;
  atom.dataset.muted = field ? "false" : "true";
  atom.setAttribute("contenteditable", "false");
  const icon = document.createElement("span");
  const svg = icons(field);

  if (svg) icon.append(svg);
  const text = cut(label);

  if (text !== label) {
    atom.title = label;
    atom.setAttribute("aria-label", label);
  }

  const name = document.createElement("span");
  name.textContent = text;
  atom.append(icon, name);

  return atom;
}

export function tokenNodes(tokens: Token[], labels: Labels, icons: Icons) {
  const out = document.createDocumentFragment();
  let afterAtom = false;
  tokens.forEach((t, i) => {
    const atom = t.type !== "NUMBER" && t.type !== "STRING";

    if (spacers && atom && (afterAtom || i === 0)) out.append(spacer);

    if (t.type === "FIELD_REF") out.append(fieldAtom(t.value, labels, icons));
    else if (t.type === "NUMBER" || t.type === "STRING") {
      const span = document.createElement("span");
      span.dataset.token = t.type === "NUMBER" ? "num" : "str";
      span.textContent = t.type === "NUMBER" ? t.value : quote(t.value);
      out.append(span);
    } else {
      const op = document.createElement("span");
      op.dataset.atom = "op";
      op.dataset.op = t.value;
      op.setAttribute("contenteditable", "false");
      op.textContent = atomSigns[t.type] ?? t.value;
      out.append(op);
    }

    afterAtom = atom;
  });

  if (spacers && afterAtom) out.append(spacer);

  return out;
}

/** Text that doesn't tokenize stays as typed, with its fields as atoms (rC). */
export function rawNodes(el: HTMLElement, text: string, labels: Labels, icons: Icons) {
  const out = document.createDocumentFragment();
  let at = 0;

  for (const m of text.matchAll(fieldRefs)) {
    if (m.index > at) out.append(text.slice(at, m.index));
    out.append(fieldAtom(m[1]!, labels, icons));
    at = m.index + m[0].length;
  }

  if (at < text.length) out.append(text.slice(at));
  el.replaceChildren(out);
}

/** Text kept as typed loses its spacers (rF). */
export function stripSpacers(node: Node) {
  node.childNodes.forEach((n) => {
    if (n.nodeType !== Node.TEXT_NODE) return stripSpacers(n);
    const text = unspaced(n.textContent ?? "");

    if (text && text !== n.textContent) n.textContent = text;
  });
}

/** The text as it's stored before tokenizing (rU): fields as {{key}}, operators as typed. */
export function rawText(node: Node) {
  let out = "";

  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) out += unspaced(n.textContent ?? "").replace(/ /g, " ");
    else if (!(n instanceof HTMLElement) || n.dataset.mentionAnchor === "true") return;
    else if (n.dataset.atom === "field") out += `{{${n.dataset.uuid ?? ""}}}`;
    else if (n.dataset.atom === "op") out += n.dataset.op ?? "";
    else n.childNodes.forEach(walk);
  };

  node.childNodes.forEach(walk);

  return out;
}

// Caret positions count characters, and an atom as one (rM)
export function size(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return unspaced(node.textContent ?? "").length;

  if (node instanceof HTMLElement && node.dataset.mentionAnchor === "true") return 0;

  if (node instanceof HTMLElement && node.dataset.atom) return 1;
  let n = 0;
  node.childNodes.forEach((c) => (n += size(c)));

  return n;
}

export function caretAt(el: HTMLElement) {
  const sel = getSelection();

  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);

  if (!el.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.setStart(el, 0);
  before.setEnd(range.endContainer, range.endOffset);

  return size(before.cloneContents());
}

export function select(range: Range) {
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Puts the caret at a position; past the end, at the end (rP). */
export function setCaret(el: HTMLElement, at: number) {
  let left = at;

  const walk = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? "";
      const length = unspaced(text).length;

      if (left > length) {
        left -= length;

        return false;
      }

      let i = 0;

      for (let seen = 0; i < text.length && seen < left; i++) if (text[i] !== spacer) seen++;
      const range = document.createRange();
      range.setStart(n, i);
      range.collapse(true);
      select(range);

      return true;
    }

    if (!(n instanceof HTMLElement)) return false;

    if (n.dataset.atom) {
      if (left > 0) {
        left -= 1;

        return false;
      }

      const range = document.createRange();
      range.setStartBefore(n);
      range.collapse(true);
      select(range);

      return true;
    }

    return [...n.childNodes].some(walk);
  };

  if ([...el.childNodes].some(walk)) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  select(range);
}

/** Whether a position is inside a string that's open (rz). */
export function inString(el: HTMLElement, at: number) {
  if (at <= 0) return false;
  let n = 0;
  let open: string | null = null;
  let escaped = false;

  const walk = (node: Node): boolean => {
    if (node instanceof Text) {
      const text = node.textContent ?? "";

      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;

        if (ch === spacer) continue;

        if (escaped) escaped = false;
        else if (open === null) open = ch === '"' || ch === "'" ? ch : null;
        else if (ch === "\\") escaped = true;
        else if (ch === open) open = null;

        if (++n >= at) return true;
      }

      return false;
    }

    if (node instanceof HTMLElement && node.dataset.atom) return ++n >= at;

    return node instanceof HTMLElement && [...node.childNodes].some(walk);
  };

  [...el.childNodes].some(walk);

  return open !== null;
}

/** What's at a position (rR): an atom, or text in its number or string span. */
export function itemAt(
  el: HTMLElement,
  at: number,
): { atom: HTMLElement } | { run: HTMLElement | null } | null {
  if (at <= 0) return null;
  let n = 0;
  let found: { atom: HTMLElement } | { run: HTMLElement | null } | null = null;

  const walk = (node: Node): boolean => {
    if (node instanceof Text) {
      const parent = node.parentElement;
      const text = node.textContent ?? "";

      for (let i = 0; i < text.length; i++) {
        if (text[i] === spacer) continue;
        n++;
        found = { run: parent?.dataset.token !== undefined ? parent : null };

        if (n >= at) return true;
      }

      return false;
    }

    if (!(node instanceof HTMLElement) || node.dataset.mentionAnchor === "true") return false;

    if (node.dataset.atom) {
      n++;
      found = { atom: node };

      return n >= at;
    }

    return [...node.childNodes].some(walk);
  };

  [...el.childNodes].some(walk);

  return n >= at ? found : null;
}

/** Clears the error marks, then marks the token or the characters at fault (rT). */
export function markError(el: HTMLElement, error: FormulaError | null) {
  const range = error && Array.isArray(error.at) ? error.at : null;
  const caret = el.querySelector(`[${errorRun}]`) || range ? caretAt(el) : null;
  el.querySelectorAll<HTMLElement>("[data-atom], [data-token]").forEach(
    (n) => delete n.dataset.error,
  );
  const runs = el.querySelectorAll(`[${errorRun}]`);
  runs.forEach((run) => run.replaceWith(...run.childNodes));

  if (runs.length) el.normalize();

  if (range) wrapRange(el, range[0], range[1]);
  else if (error && !Array.isArray(error.at)) {
    const items = el.querySelectorAll<HTMLElement>("[data-atom], [data-token]");

    if (items.length) items[Math.min(error.at, items.length - 1)]!.dataset.error = "true";
  }

  if (caret !== null) setCaret(el, caret);
}

// Wraps characters [start, end) of the stored text in an error run; an atom counts as its {{key}} or operator (r_)
export function wrapRange(el: HTMLElement, start: number, end: number) {
  if (end <= start) return;
  let at = 0;

  const walk = (node: Node): boolean => {
    if (node instanceof Text) {
      const text = node.textContent ?? "";
      let from = -1;
      let to = text.length;

      for (let i = 0; i < text.length; i++) {
        if (text[i] === spacer) continue;

        if (at === start) from = i;

        if (++at === end) {
          to = i + 1;
          break;
        }
      }

      if (from === -1) return false;
      const run = document.createElement("span");
      run.setAttribute(errorRun, "true");
      run.textContent = text.slice(from, to);
      node.replaceWith(...[text.slice(0, from), run, text.slice(to)].filter((part) => part !== ""));

      return true;
    }

    if (!(node instanceof HTMLElement) || node.dataset.mentionAnchor === "true") return false;

    if (!node.dataset.atom) return [...node.childNodes].some(walk);
    at +=
      node.dataset.atom === "field"
        ? `{{${node.dataset.uuid ?? ""}}}`.length
        : (node.dataset.op ?? "").length;

    return false;
  };

  [...el.childNodes].some(walk);
}

/** Puts tokens at the caret, or the end; an empty string gets the caret between its quotes (r$). */
export function insertAtCaret(el: HTMLElement, tokens: Token[], labels: Labels, icons: Icons) {
  const sel = getSelection();
  const current = sel?.rangeCount ? sel.getRangeAt(0) : null;
  let range: Range;

  if (current && el.contains(current.startContainer) && el.contains(current.endContainer))
    range = current.cloneRange();
  else {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }

  range.deleteContents();
  const nodes = tokenNodes(tokens, labels, icons);
  const added = [...nodes.childNodes];
  range.insertNode(nodes);
  const last = added.at(-1);

  if (!last) return;
  const caret = document.createRange();
  const t = tokens.at(-1);

  if (t?.type === "STRING" && t.value === "" && last.firstChild) caret.setStart(last.firstChild, 1);
  else caret.setStartAfter(last);
  caret.collapse(true);
  select(caret);
}

export type FormulaEditorHandle = {
  focus: () => void;
  insertTokens: (tokens: Token[]) => void;
  startMention: () => void;
};

export type Mention = { query: string; selected: string | null; anchor: HTMLElement };

/**
 * Fields are atomic references. Delete removes a whole atom; Alt+Backspace removes a whole number or string.
 * Arrows cross atoms in one step. Enter adds a line only inside strings, and spaces cannot split numbers.
 * Copied references use {{key}}. Incomplete formulas keep their original text until they can be tokenized.
 */
export function FormulaEditor({
  expression,
  fields,
  type,
  onChange,
  labelledBy,
  ref,
}: {
  expression: string;
  fields: Field[];
  type: "NUMBER" | "TEXT";
  onChange: (expression: string) => void;
  labelledBy: string;
  ref: Ref<FormulaEditorHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const sprites = useRef<HTMLDivElement>(null);

  const memo = useRef<{
    emitted: string;
    raw: string | null;
    composing: boolean;
    labels: Labels | null;
  }>({ emitted: expression, raw: null, composing: false, labels: null });

  const [mention, setMention] = useState<Mention | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<Element | null>(null);
  const options = useMemo(() => formulaFields(fields, type), [fields, type]);

  const matches = useMemo(
    () => (mention ? options.filter((f) => matchesQuery(f.title, mention.query)) : options),
    [mention, options],
  );

  const labels = useMemo<Labels>(() => {
    const byKey = new Map(fields.map((f) => [f.key, f]));

    return (key) => {
      const field = byKey.get(key);

      return { label: field ? field.title : "(deleted)", field };
    };
  }, [fields]);

  // Atoms are built outside React, so their icons are copied from icons React drew below
  const icons = useCallback<Icons>(
    (field) =>
      sprites.current?.querySelector(`[data-icon="${iconId(field)}"] svg`)?.cloneNode(true),
    [],
  );

  // Resolve pasted {{key}} references to the field names shown in the editor.
  const tokenize = useCallback(
    (text: string) =>
      tokenizeFormula(text)?.map((t) =>
        t.type === "STRING"
          ? { ...t, value: t.value.replace(fieldRefs, (_, key: string) => labels(key).label) }
          : t,
      ) ?? null,
    [labels],
  );

  const checked = useSettled(expression, 300);

  const error = useMemo(
    () => (checked.trim() ? failure(parseFormula(checked, type)) : null),
    [checked, type],
  );

  const errorNow = useRef(error);
  errorNow.current = error;

  // The DOM follows the expression when it changes from outside, or when fields are renamed
  useLayoutEffect(() => {
    const el = box.current;

    if (!el) return;
    const m = memo.current;
    const current = m.emitted === expression && !!el.firstChild;

    if (current && m.labels === labels) return;
    const caret = current ? caretAt(el) : null;
    const tokens = tokenize(expression);

    if (tokens) el.replaceChildren(tokenNodes(tokens, labels, icons));
    else if (!current) rawNodes(el, expression, labels, icons);
    m.emitted = expression;
    m.labels = labels;
    m.raw = rawText(el);

    if (caret !== null) setCaret(el, caret);
    markError(el, errorNow.current);
  }, [expression, labels, tokenize, icons]);
  useLayoutEffect(() => {
    if (box.current) markError(box.current, error);
    setHovered(null);
  }, [error, expression]);
  useLayoutEffect(() => {
    if (!mention || memo.current.emitted === expression) return;
    anchor.current = null;
    setMention(null);
  }, [expression, mention]);
  useEffect(() => {
    const el = box.current;

    if (!el) return;
    el.focus();
    setCaret(el, Infinity);
  }, []);

  const sync = useCallback(() => {
    const el = box.current;
    const m = memo.current;

    if (!el || m.composing) return;
    const raw = rawText(el);

    if (raw === m.raw) return;
    m.raw = raw;
    const caret = caretAt(el);
    const tokens = tokenize(raw);

    if (!tokens) {
      stripSpacers(el);

      if (caret !== null) setCaret(el, caret);
      m.emitted = raw;
      onChange(raw);

      return;
    }

    el.replaceChildren(tokenNodes(tokens, labels, icons));

    if (caret !== null) setCaret(el, caret);
    markError(el, errorNow.current);
    m.emitted = formulaText(tokens);
    onChange(m.emitted);
  }, [tokenize, labels, icons, onChange]);

  const startMention = useCallback(() => {
    const el = box.current;

    if (!el) return;
    el.focus();
    const at = caretAt(el);

    if (at !== null && inString(el, at)) return;
    const node = document.createElement("span");
    node.setAttribute("data-mention-anchor", "true");
    node.textContent = "@";
    const sel = getSelection();
    let range: Range;

    if (sel?.rangeCount && el.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0).cloneRange();
      range.deleteContents();
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    range.insertNode(node);
    const end = document.createRange();
    end.selectNodeContents(node);
    end.collapse(false);
    select(end);
    anchor.current = node;
    setMention({ query: "", selected: options[0]?.key ?? null, anchor: node });
  }, [options]);

  const cancelMention = useCallback(() => {
    if (!mention) return;
    const parent = mention.anchor.parentNode;

    if (parent) {
      const text = document.createTextNode("");
      parent.insertBefore(text, mention.anchor);
      parent.removeChild(mention.anchor);
      const range = document.createRange();
      range.setStart(text, 0);
      range.collapse(true);
      select(range);
    }

    anchor.current = null;
    setMention(null);
    sync();
  }, [mention, sync]);

  const pickField = useCallback(
    (key: string) => {
      if (!mention || !matches.some((f) => f.key === key)) return;
      const parent = mention.anchor.parentNode;

      if (parent) {
        const after = document.createTextNode(spacer);
        parent.insertBefore(document.createTextNode(spacer), mention.anchor);
        parent.insertBefore(fieldAtom(key, labels, icons), mention.anchor);
        parent.insertBefore(after, mention.anchor);
        parent.removeChild(mention.anchor);
        const range = document.createRange();
        range.setStart(after, after.length);
        range.collapse(true);
        select(range);
      }

      anchor.current = null;
      setMention(null);
      sync();
    },
    [mention, matches, labels, icons, sync],
  );

  useEffect(() => {
    if (!mention) return;

    const close = (e: PointerEvent) => {
      const target = e.target;

      if (
        (target instanceof Node && box.current?.contains(target)) ||
        (target instanceof Element && target.closest('[data-testid="formula-autocomplete"]'))
      )
        return;
      cancelMention();
    };

    document.addEventListener("pointerdown", close);

    return () => document.removeEventListener("pointerdown", close);
  }, [mention, cancelMention]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => box.current?.focus(),
      insertTokens: (tokens) => {
        const el = box.current;

        if (!el) return;
        const sel = getSelection();
        const inside = !!sel?.rangeCount && el.contains(sel.anchorNode);
        el.focus();

        if (!inside) setCaret(el, Infinity);
        insertAtCaret(el, tokens, labels, icons);
        sync();
      },
      startMention,
    }),
    [labels, icons, sync, startMention],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = box.current;

    if (!el) return;

    if (
      (e.metaKey || e.ctrlKey) &&
      !e.altKey &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.key.toLowerCase() === "a"
    ) {
      e.preventDefault();
      e.stopPropagation();

      if (mention) cancelMention();
      el.querySelectorAll('[data-selected="true"]').forEach((atom) =>
        atom.removeAttribute("data-selected"),
      );
      const range = document.createRange();
      range.selectNodeContents(el);
      select(range);

      return;
    }

    const selectedAtom = () =>
      el.querySelector<HTMLElement>('[data-atom="field"][data-selected="true"]');

    if (
      !mention &&
      (e.key === "Backspace" || e.key === "Delete") &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const atom = selectedAtom();

      if (atom) {
        e.preventDefault();
        atom.remove();
        sync();

        return;
      }
    }

    if (!(e.metaKey || e.ctrlKey || e.altKey || e.key === "Shift"))
      el.querySelectorAll('[data-atom="field"][data-selected="true"]').forEach((a) =>
        a.removeAttribute("data-selected"),
      );

    if (mention) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();

        if (!matches.length) return;
        const i = matches.findIndex((f) => f.key === mention.selected);

        const next =
          i === -1 ? 0 : (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;

        setMention((m) => m && { ...m, selected: matches[next]!.key });

        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();

        if (mention.selected) pickField(mention.selected);
        else cancelMention();

        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        cancelMention();

        return;
      }

      if (e.key === "Tab") return void cancelMention();
      const node = anchor.current;

      if (!node) return;

      const query = (q: string) => {
        setMention(
          (m) =>
            m && {
              ...m,
              query: q,
              selected: options.find((f) => matchesQuery(f.title, q))?.key ?? null,
            },
        );
        node.textContent = `@${q}`;
        const end = document.createRange();
        end.selectNodeContents(node);
        end.collapse(false);
        select(end);
      };

      if (e.key === "Backspace") {
        e.preventDefault();

        if (mention.query) query(mention.query.slice(0, -1));
        else cancelMention();

        return;
      }

      if (e.key === "Delete" && !mention.query) {
        e.preventDefault();
        cancelMention();

        return;
      }

      if (e.key === "@") {
        e.preventDefault();
        query("");

        return;
      }

      // An operator ends the mention and goes in
      if ("+*/()".includes(e.key) && e.key.length === 1) {
        e.preventDefault();
        cancelMention();
        insertAtCaret(el, [{ type: operatorType(e.key)!, value: e.key }], labels, icons);
        sync();

        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        query(mention.query + e.key);
      }

      return;
    }

    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      getSelection()?.isCollapsed
    ) {
      const at = caretAt(el);
      const hit = at === null ? null : itemAt(el, e.key === "Backspace" ? at : at + 1);
      const target = hit && ("atom" in hit ? hit.atom : e.altKey ? hit.run : null);

      if (target) {
        e.preventDefault();
        target.remove();
        sync();

        return;
      }
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "Enter") {
      e.preventDefault();
      const sel = getSelection();
      const at = caretAt(el);

      if (!sel?.rangeCount || at === null || !inString(el, at)) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const line = document.createTextNode("\n");
      range.insertNode(line);
      range.setStartAfter(line);
      range.collapse(true);
      select(range);
      sync();

      return;
    }

    if (e.key === "@") {
      const at = caretAt(el);

      if (at !== null && inString(el, at)) return;
      e.preventDefault();
      startMention();

      return;
    }

    if (e.key === " ") {
      const node = getSelection()?.anchorNode;
      const parent = node instanceof Element ? node : node?.parentElement;

      if (parent?.closest('[data-token="num"]')) return void e.preventDefault();
    }

    if (
      getSelection()?.isCollapsed &&
      !e.shiftKey &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      const at = caretAt(el);

      if (at === null) return;
      e.preventDefault();
      setCaret(el, Math.max(0, at + (e.key === "ArrowLeft" ? -1 : 1)));
    }
  };

  // A click on a field atom selects it, the caret after it
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const el = box.current;

    if (!el) return;
    el.querySelectorAll('[data-atom="field"][data-selected="true"]').forEach((a) =>
      a.removeAttribute("data-selected"),
    );
    const atom = e.target instanceof Element ? e.target.closest('[data-atom="field"]') : null;

    if (!atom) return;
    e.preventDefault();
    atom.setAttribute("data-selected", "true");
    const range = document.createRange();
    range.setStartAfter(atom);
    range.collapse(true);
    select(range);
  };

  const onCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    const el = box.current;

    if (!el) return;
    const atom = el.querySelector<HTMLElement>('[data-atom="field"][data-selected="true"]');

    if (atom) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", `{{${atom.dataset.uuid ?? ""}}}`);

      if (e.type === "cut") {
        atom.remove();
        sync();
      }

      return;
    }

    const sel = getSelection();

    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
    const copy = document.createElement("div");
    copy.append(range.cloneContents());
    e.preventDefault();
    e.clipboardData.setData("text/plain", rawText(copy));

    if (e.type === "cut") {
      range.deleteContents();
      sync();
    }
  };

  // Pasted text goes in as text; inside a string, its fields go in by name and its quotes escaped
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const el = box.current;
    const sel = getSelection();

    if (!el || !sel?.rangeCount) return;
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");

    const text = html
      ? rawText(new DOMParser().parseFromString(html, "text/html").body)
      : e.clipboardData.getData("text/plain");

    const range = sel.getRangeAt(0);
    range.deleteContents();
    const at = caretAt(el);

    const node = document.createTextNode(
      at !== null && inString(el, at)
        ? text
            .replace(fieldRefs, (_, key: string) => labels(key).label)
            .replace(/\\/g, "\\\\")
            .replace(/["']/g, "\\$&")
        : text,
    );

    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    select(range);
    memo.current.raw = null;
    sync();
  };

  const message = error?.error;

  const sections = useMemo(() => {
    const out: { type: Field["type"]; items: Field[] }[] = [];

    for (const f of matches) {
      const last = out.at(-1);

      if (last?.type === f.type) last.items.push(f);
      else out.push({ type: f.type, items: [f] });
    }

    return out;
  }, [matches]);

  return (
    <div ref={wrap} className="relative">
      <div
        ref={box}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        tabIndex={0}
        data-placeholder="Type a formula"
        onInput={sync}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseOver={(e) => {
          const hit =
            e.target instanceof Element
              ? e.target.closest('[data-error-run="true"], [data-error="true"]')
              : null;

          if (hit && hit !== hovered) setHovered(hit);
        }}
        onMouseOut={(e) => {
          if (!(e.relatedTarget instanceof Node && hovered?.contains(e.relatedTarget)))
            setHovered(null);
        }}
        onCopy={onCopy}
        onCut={onCopy}
        onPaste={onPaste}
        onCompositionStart={() => (memo.current.composing = true)}
        onCompositionEnd={() => {
          memo.current.composing = false;
          sync();
        }}
        className={cn(
          "relative min-h-20 cursor-text rounded-sm bg-white px-3 py-2.5 text-14 leading-[22px] break-words whitespace-pre-wrap text-ink caret-ink shadow-input outline-none focus:shadow-input-focus max-[480px]:min-h-40 max-[480px]:text-16",
          "focus:empty:before:content-[attr(data-placeholder)] focus:empty:before:text-placeholder",
          "[&_[data-token]]:text-14 [&_[data-token]]:text-interactive",
          "[&_[data-atom=op]]:inline-block [&_[data-atom=op]]:px-1 [&_[data-atom=op]]:text-ink",
          "[&_[data-atom=field]]:inline-flex [&_[data-atom=field]]:cursor-pointer [&_[data-atom=field]]:items-center [&_[data-atom=field]]:gap-1 [&_[data-atom=field]]:rounded-sm [&_[data-atom=field]]:bg-grey-30 [&_[data-atom=field]]:px-1.5 [&_[data-atom=field]]:align-middle [&_[data-atom=field]]:text-14 [&_[data-atom=field]]:leading-[18px] [&_[data-atom=field]]:font-medium [&_[data-atom=field]]:whitespace-nowrap [&_[data-atom=field]]:text-ink [&_[data-atom=field]]:select-text",
          "[&_[data-atom=field]_svg]:block [&_[data-atom=field]_svg]:size-3 [&_[data-atom=field]_svg]:text-muted",
          "[&_[data-atom=field][data-muted=true]]:text-muted",
          "[&_[data-atom=field][data-selected=true]]:bg-interactive [&_[data-atom=field][data-selected=true]]:text-white [&_[data-atom=field][data-selected=true]_svg]:text-white",
          "[&_[data-mention-anchor]]:inline [&_[data-mention-anchor]]:text-interactive",
          "[&_[data-error=true]]:underline [&_[data-error=true]]:decoration-error [&_[data-error=true]]:decoration-wavy [&_[data-error=true]]:decoration-1 [&_[data-error=true]]:underline-offset-3",
          "[&_[data-token][data-error=true]]:text-error [&_[data-atom=op][data-error=true]]:text-error",
          "[&_[data-error-run]]:text-error [&_[data-error-run]]:underline [&_[data-error-run]]:decoration-error [&_[data-error-run]]:decoration-wavy [&_[data-error-run]]:decoration-1 [&_[data-error-run]]:underline-offset-3",
        )}
      />
      {message && (
        <div className="absolute right-1.5 bottom-1.5">
          <Tip content={message} side="top">
            <button
              type="button"
              aria-label={message}
              data-testid="formula-validation-error"
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-sm bg-error-subtle p-0 text-error transition-colors duration-120 select-none hover:bg-red-20 [&>svg]:size-3.5"
            >
              <TextT />
            </button>
          </Tip>
        </div>
      )}
      {message && (
        <Tooltip.Root open={!!hovered}>
          <Tooltip.Portal>
            <Tooltip.Positioner
              anchor={hovered}
              side="top"
              sideOffset={10}
              collisionPadding={16}
              className="z-60"
            >
              <Tooltip.Popup className="max-w-[calc(100vw-32px)] rounded-sm bg-ink px-2 py-1 text-center text-12 leading-4 font-semibold text-white">
                {message}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
      {mention && (
        <Autocomplete
          sections={sections}
          query={mention.query}
          selected={mention.selected}
          anchor={mention.anchor}
          wrap={wrap}
          onPick={pickField}
          onHover={(key) => setMention((m) => m && { ...m, selected: key })}
        />
      )}
      <div ref={sprites} hidden>
        {[...new Map(fields.map((f) => [iconId(f), f])).values()].map((f) => (
          <span key={iconId(f)} data-icon={iconId(f)}>
            {fieldIcon(f)}
          </span>
        ))}
        <span data-icon={iconId()}>
          <Hash />
        </span>
      </div>
    </div>
  );
}

/** Anchor autocomplete below @, or above it when there is insufficient space. */
export function Autocomplete({
  sections,
  query,
  selected,
  anchor,
  wrap,
  onPick,
  onHover,
}: {
  sections: { type: Field["type"]; items: Field[] }[];
  query: string;
  selected: string | null;
  anchor: HTMLElement;
  wrap: RefObject<HTMLDivElement | null>;
  onPick: (key: string) => void;
  onHover: (key: string) => void;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const box = wrap.current;

    if (!box) return setStyle(null);
    const a = anchor.getBoundingClientRect();
    const w = box.getBoundingClientRect();
    const below = innerHeight - a.bottom - 4;
    const above = a.top - 4;
    const native = box.closest(".native-authoring");
    const width = Math.min(400, innerWidth - 32);

    const bounds: CSSProperties = native
      ? {
          width,
          minWidth: 0,
          maxWidth: width,
          maxHeight: Math.min(280, Math.max(above, below) - 8),
        }
      : {};

    const left = native
      ? Math.min(Math.max(a.left, 16), innerWidth - width - 16) - w.left
      : a.left - w.left;

    setStyle(
      below < 280 && above > below
        ? { ...bounds, left, bottom: w.bottom - a.top + 4 }
        : { ...bounds, left, top: a.bottom - w.top + 4 },
    );
  }, [anchor, query, wrap]);

  if (!style) return null;

  const section =
    "select-none not-last:mb-1.5 not-last:border-b not-last:border-line not-last:pb-1.5";

  return (
    <div
      data-testid="formula-autocomplete"
      style={style}
      className="absolute z-1001 max-h-70 max-w-100 min-w-60 overflow-y-auto rounded-sm bg-white py-1.5 shadow-popup"
    >
      {sections.length === 0 ? (
        <div className={section}>
          <div className={cn(item, "cursor-default text-muted")}>
            <ItemLabel icon={<MagnifyingGlass />}>No fields match</ItemLabel>
          </div>
        </div>
      ) : (
        sections.map((s) => (
          <div key={s.type} className={section}>
            <div className={cn(sectionLabel, "px-3.5")}>{sectionTitles[s.type]}</div>
            {s.items.map((f) => (
              <div key={f.key} onMouseEnter={() => onHover(f.key)}>
                <div
                  data-highlighted={f.key === selected ? "" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPick(f.key);
                  }}
                  className={item}
                >
                  <ItemLabel icon={fieldIcon(f)}>{f.title}</ItemLabel>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
