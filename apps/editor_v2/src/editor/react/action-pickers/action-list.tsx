import { RowContent } from "@/ui/menu";
import { group, groupLabel, listEmpty, listFooter, row } from "@/ui/surface";
import { sectioned, type EditorAction } from "../../core/actions";

/** An action list's scrolling box: room for a group or two, then it scrolls. */
export const actionListBox =
  "group/popup max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]";

/** What an insert menu says when an action fails without saying why. */
export const cannotInsert = "This block cannot be inserted here.";

/**
 * The actions an insert menu offers: in their groups before a search, and in one ranked list while searching. Each row
 * shows the Markdown that makes its block. A status line, there all along, says when a search finds nothing.
 */
export function ActionList({
  actions,
  searching,
  selectedIndex,
  onHighlight,
  onSelect,
  optionId,
  optionRef,
  error,
  empty,
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
  /** What the status line says when a search finds nothing. */
  empty: string;
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
      {/* Keep the empty live region accessible without adding a blank row. */}
      <p role="status" className={actions.length ? "sr-only" : listEmpty}>
        {!actions.length && empty}
      </p>
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

/** The highlighted action's description, in the footer under an action list. */
export function ActionDescription({ action }: { action: EditorAction | undefined }) {
  return action?.description ? (
    <p className={listFooter} aria-hidden="true">
      {action.description}
    </p>
  ) : null;
}
