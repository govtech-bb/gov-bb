import { sectioned, type EditorAction } from "../editor/core/actions";
import { RowContent } from "../ui/menu";
import { group, groupLabel, listEmpty, row } from "../ui/surface";

/** The list of page content to insert: room for a group or two, then it scrolls. */
export const actionList =
  "group/popup max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]";

/**
 * The blocks a page can insert: grouped before a search, and while searching one ranked list. Each row shows the
 * Markdown that makes its block, and the highlighted block's description goes in the menu's footer (`listFooter`).
 */
export function PageActionList({
  actions,
  searching,
  selectedIndex,
  onHighlight,
  onSelect,
  optionId,
  optionRef,
  error,
}: {
  actions: readonly EditorAction[];
  /** A search ranked the actions, so they go in one list rather than their groups. */
  searching: boolean;
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (action: EditorAction, index: number) => void;
  optionId: (index: number) => string;
  optionRef?: (index: number, element: HTMLButtonElement | null) => void;
  error?: string;
}) {
  const option = (action: EditorAction, index: number) => (
    <button
      type="button"
      tabIndex={-1}
      role="option"
      id={optionId(index)}
      ref={(element) => optionRef?.(index, element)}
      key={action.id}
      className={row}
      aria-label={action.title}
      aria-selected={index === selectedIndex}
      data-highlighted={index === selectedIndex ? "" : undefined}
      // Only a pointer that moves: one resting where the menu opens leaves Enter's choice alone
      onMouseMove={() => onHighlight(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(action, index)}
    >
      <RowContent icon={action.icon} detail={action.markdown}>
        {action.title}
      </RowContent>
    </button>
  );

  return (
    <>
      {error && (
        <p className="m-2 text-error" role="alert">
          {error}
        </p>
      )}
      {!actions.length && <p className={listEmpty}>No content blocks match your search.</p>}
      {searching
        ? actions.map(option)
        : sectioned(actions).map(({ group: heading, items }) => (
            <div className={group} role="group" aria-label={heading} key={heading}>
              <div className={groupLabel} aria-hidden="true">
                {heading}
              </div>
              {items.map(({ item, index }) => option(item, index))}
            </div>
          ))}
    </>
  );
}
