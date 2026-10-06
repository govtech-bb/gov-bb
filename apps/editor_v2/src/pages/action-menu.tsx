import type { ReactNode } from "react";
import { sectioned, type EditorAction } from "../editor/core/actions";
import { ItemLabel, item, sectionLabel } from "../ui/item";

export function PageActionList({
  actions,
  selectedIndex,
  onHighlight,
  onSelect,
  optionId,
  optionRef,
  error,
}: {
  actions: readonly EditorAction[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (action: EditorAction, index: number) => void;
  optionId: (index: number) => string;
  optionRef?: (index: number, element: HTMLButtonElement | null) => void;
  error?: string;
}) {
  return (
    <>
      {error && (
        <p className="page-menu-error" role="alert">
          {error}
        </p>
      )}
      {!actions.length && <p className="page-menu-empty">No content blocks match your search.</p>}
      {sectioned(actions).map(({ group, items }) => (
        <div className="page-action-group" role="group" aria-label={group} key={group}>
          <div className={`${sectionLabel} px-3.5`} aria-hidden="true">
            {group}
          </div>
          {items.map(({ item: action, index }) => (
            <button
              type="button"
              tabIndex={-1}
              role="option"
              id={optionId(index)}
              ref={(element) => optionRef?.(index, element)}
              key={action.id}
              className={item}
              aria-label={action.title}
              aria-selected={index === selectedIndex}
              data-highlighted={index === selectedIndex ? "" : undefined}
              onMouseEnter={() => onHighlight(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(action, index)}
            >
              <ItemLabel icon={action.icon}>{action.title}</ItemLabel>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

export function PageMenuRow({
  children,
  icon,
  ...props
}: {
  children: ReactNode;
  icon?: ReactNode;
} & Omit<import("react").ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      className={`${item} hover:bg-blue-80 hover:text-white hover:[&_svg]:text-white focus-visible:bg-blue-80 focus-visible:text-white focus-visible:[&_svg]:text-white disabled:cursor-not-allowed disabled:opacity-40`}
      {...props}
    >
      <ItemLabel icon={icon}>{children}</ItemLabel>
    </button>
  );
}
