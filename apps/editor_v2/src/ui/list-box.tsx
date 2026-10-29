import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn";
import { RowContent } from "./menu";
import { Popover } from "./popover";
import { group, groupLabel, listEmpty, listFooter, row, type PopupName } from "./surface";

/**
 * Arrow, Home, End and Enter navigation without moving focus out of the input.
 * Spread comboboxProps on the input, listProps on Root and optionProps(index) on each Option.
 * Scrolls only the list. Use initial: -1 to start without a highlighted row.
 */
export function useListNavigation(
  count: number,
  { onPick, initial = 0 }: { onPick?: (index: number) => void; initial?: number } = {},
) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(initial);
  // Within the list as it shrinks, or -1 for none
  const index = Math.min(highlight, count - 1);
  const shown = useRef(index);

  // Scrolled into view within the list, the nearest way: the page round it stays where it is
  useEffect(() => {
    const box = list.current;
    const option = box?.querySelector("[data-highlighted]");

    if (shown.current === index || !box || !option) return;
    shown.current = index;
    const view = box.getBoundingClientRect();
    const { top, bottom } = option.getBoundingClientRect();

    if (top < view.top) box.scrollTop -= view.top - top;
    else if (bottom > view.bottom) box.scrollTop += bottom - view.bottom;
  }, [index]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!count) return;

    const next = new Map([
      ["ArrowDown", (index + 1) % count],
      ["ArrowUp", index <= 0 ? count - 1 : index - 1],
      ["Home", 0],
      ["End", count - 1],
    ]).get(event.key);

    if (next !== undefined) {
      event.preventDefault();
      setHighlight(next);
    } else if (event.key === "Enter" && index >= 0 && onPick) {
      event.preventDefault();
      onPick(index);
    }
  };

  const optionId = (option: number) => `${id}-${option}`;

  return {
    /** The highlighted row, or -1. */
    index,
    setIndex: setHighlight,
    onKeyDown,
    /** The field's: a combobox pointing at the highlighted row, with these keys. */
    comboboxProps: {
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": count > 0,
      "aria-controls": count > 0 ? `${id}-list` : undefined,
      "aria-activedescendant": index >= 0 ? optionId(index) : undefined,
      onKeyDown,
    } as const,
    listProps: { id: `${id}-list`, ref: list },
    optionProps: (option: number) => ({
      id: optionId(option),
      highlighted: option === index,
      onHighlight: () => setHighlight(option),
    }),
  };
}

/**
 * The list: a listbox, named, that scrolls within its popup and keeps its scroll there. Where some of its rows have an
 * icon, the others' words still start on the same line.
 */
function ListBoxRoot({ className, ...props }: Omit<ComponentProps<"div">, "role"> & PopupName) {
  return (
    <div
      role="listbox"
      {...props}
      className={cn("group/popup min-h-0 overflow-y-auto overscroll-contain py-1", className)}
    />
  );
}

/** Rows that belong together, under a heading that names them, ruled off from the next group. */
function ListBoxGroup({ label, children }: { label: ReactNode; children: ReactNode }) {
  const id = useId();

  return (
    <div role="group" aria-labelledby={id} className={group}>
      <div id={id} className={groupLabel}>
        {label}
      </div>
      {children}
    </div>
  );
}

type OptionProps = Omit<ComponentProps<"div">, "children" | "role" | "onMouseMove"> & {
  /** The row Enter picks: navy, as a menu's highlighted row, and the field's active descendant. */
  highlighted: boolean;
  /**
   * The pointer moved onto it. Only a moving pointer: one resting where the list opens leaves Enter's choice alone, and
   * rows the arrow keys scroll under it don't take the highlight from them.
   */
  onHighlight?: () => void;
  icon?: ReactNode;
  /** At the row's end: a shortcut, the Markdown that makes it, a count. */
  detail?: ReactNode;
  children: ReactNode;
};

/**
 * A row of the list. A press on it leaves the focus where it was, in the search box or the text, and its `onClick`
 * picks it. Its `id` is what the field's `aria-activedescendant` names.
 */
function ListBoxOption({
  highlighted,
  onHighlight,
  icon,
  detail,
  className,
  onMouseDown,
  children,
  ...props
}: OptionProps) {
  return (
    <div
      role="option"
      aria-selected={highlighted}
      data-highlighted={highlighted ? "" : undefined}
      {...props}
      className={cn(row, className)}
      onMouseMove={() => {
        if (!highlighted) onHighlight?.();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.(event);
      }}
    >
      <RowContent icon={icon} detail={detail}>
        {children}
      </RowContent>
    </div>
  );
}

/**
 * What a search that finds nothing says, such as “No blocks match”, beside the list rather than in it. Keep it on the
 * page, empty while there are rows: it takes no room then, and its words are read out as they arrive.
 */
function ListBoxEmpty({ children }: { children?: ReactNode }) {
  return (
    <p role="status" className={listEmpty}>
      {children}
    </p>
  );
}

/**
 * Under the list, what its highlighted row does, changing as the highlight moves. Only for the eye: a screen reader
 * hears the row itself.
 */
function ListBoxFooter({ children }: { children?: ReactNode }) {
  return children ? (
    <p aria-hidden="true" className={listFooter}>
      {children}
    </p>
  ) : null;
}

/**
 * The search box at the head of a list: its icon, a field with no frame of its own, and GovBB's focus halo round it.
 * With useListNavigation's `comboboxProps`, the arrows move through the rows below while the typing stays here.
 */
function ListBoxSearch({ className, ...props }: Omit<ComponentProps<"input">, "type"> & PopupName) {
  return (
    <label className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-2.5 text-muted">
      <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        {...props}
        className={cn(
          "min-w-0 flex-1 rounded-sm bg-transparent text-14 leading-5 text-ink placeholder:text-placeholder max-sm:text-16",
          className,
        )}
      />
    </label>
  );
}

/**
 * A popover that holds a list: no padding of its own, its Search, list and Footer stacked, and only the list scrolling
 * between them.
 */
function ListBoxPopover({ className, ...props }: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Content {...props} className={cn("flex flex-col overflow-hidden p-0", className)} />
  );
}

/**
 * Listbox parts for choices that keep focus in an input, including Lexical typeaheads.
 * Pair with useListNavigation for keyboard handling, or provide the editor's own navigation.
 */
export const ListBox = {
  Popover: ListBoxPopover,
  Search: ListBoxSearch,
  Root: ListBoxRoot,
  Group: ListBoxGroup,
  Option: ListBoxOption,
  Empty: ListBoxEmpty,
  Footer: ListBoxFooter,
};
