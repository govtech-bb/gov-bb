import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BuilderFormSummary } from "../../types/index";
import { useTransitionPresence } from "./-use-transition";
import s from "./-styles.module.css";

interface FormComboboxProps {
  forms: BuilderFormSummary[];
  /** Selected form id ("" = no linked form). */
  value: string;
  onChange: (formId: string) => void;
}

interface Option {
  formId: string;
  label: string;
  meta: string;
}

/**
 * A searchable select for the "Form to link" field: a button showing the
 * current choice that opens a filterable, keyboard-navigable list. Payload-
 * styled (own classes). Includes a "No linked form" option at the top.
 *
 * The dropdown is rendered in a portal with fixed positioning so it isn't
 * clipped by the fields panel's `overflow: auto`.
 */
export function FormCombobox({ forms, value, onChange }: FormComboboxProps) {
  const panel = useTransitionPresence("--dropdown-close-dur");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = forms.find((f) => f.formId === value);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = forms
      .filter(
        (f) =>
          !q ||
          f.formId.toLowerCase().includes(q) ||
          (f.title ?? "").toLowerCase().includes(q),
      )
      .map<Option>((f) => ({
        formId: f.formId,
        label: f.title || f.formId,
        meta: `${f.formId}${f.isPublished ? "" : " · draft"}`,
      }));
    return [{ formId: "", label: "No linked form", meta: "" }, ...matches];
  }, [forms, query]);

  useEffect(() => {
    if (!panel.mounted) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        panel.close();
      }
    }
    // The panel is fixed-positioned at open time, so scrolling the page would
    // leave it floating detached from the field — close instead. Scrolls
    // inside the panel's own option list are fine.
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      panel.close();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [panel.mounted]);

  const openPanel = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setQuery("");
    setActive(0);
    panel.open();
  };

  const choose = (formId: string) => {
    onChange(formId);
    panel.close();
    setQuery("");
  };

  return (
    <div className={s.combo} ref={rootRef}>
      <button
        type="button"
        className={s.comboInput}
        aria-haspopup="listbox"
        aria-expanded={panel.isOpen}
        onClick={() => (panel.mounted ? panel.close() : openPanel())}
      >
        <span className={selected ? undefined : s.comboPlaceholder}>
          {selected ? selected.title || selected.formId : "No linked form"}
        </span>
        <span aria-hidden className={s.comboCaret}>
          ▾
        </span>
      </button>
      {panel.mounted &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className={`${s.comboPanel} t-dropdown ${panel.cls}`}
            data-origin="top-left"
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
            }}
          >
            <input
              autoFocus
              className={s.comboSearch}
              placeholder="Search forms…"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={`${listId}-opt-${active}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, options.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[active]) choose(options[active].formId);
                } else if (e.key === "Escape") {
                  panel.close();
                }
              }}
            />
            <ul className={s.comboList} role="listbox" id={listId}>
              {options.length === 1 && (
                <li className={s.comboEmpty}>No matching forms</li>
              )}
              {options.map((o, i) => (
                <li key={o.formId || "__none"}>
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-opt-${i}`}
                    aria-selected={o.formId === value}
                    className={`${s.comboOption} ${i === active ? s.comboOptionActive : ""} ${o.formId === value ? s.comboOptionSelected : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.formId)}
                  >
                    <span className={s.comboOptionLabel}>{o.label}</span>
                    {o.meta && (
                      <span className={s.comboOptionId}>{o.meta}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
