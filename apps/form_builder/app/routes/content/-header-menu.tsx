import { useEffect, useRef } from "react";
import { MoreHorizontalIcon } from "hugeicons-react";
import { useTransitionPresence } from "./-use-transition";
import s from "./-styles.module.css";

export interface HeaderMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * The doc-header's "⋯" overflow menu: secondary actions that don't earn a
 * dedicated button. Same dropdown transition as the form combobox; no portal —
 * the sticky header isn't overflow-clipped.
 */
export function HeaderMenu({
  items,
  ariaLabel = "More actions",
}: {
  items: HeaderMenuItem[];
  ariaLabel?: string;
}) {
  const panel = useTransitionPresence("--dropdown-close-dur");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel.mounted) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) panel.close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") panel.close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.mounted]);

  if (items.length === 0) return null;

  return (
    <div className={s.menuWrap} ref={rootRef}>
      <button
        type="button"
        className={s.secondaryBtn}
        aria-haspopup="menu"
        aria-expanded={panel.isOpen}
        aria-label={ariaLabel}
        onClick={() => (panel.mounted ? panel.close() : panel.open())}
      >
        <MoreHorizontalIcon size={15} />
      </button>
      {panel.mounted && (
        <div
          className={`${s.menuPanel} t-dropdown ${panel.cls}`}
          data-origin="top-right"
          role="menu"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`${s.menuItem} ${it.danger ? s.menuItemDanger : ""}`}
              onClick={() => {
                panel.close();
                it.onSelect();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
