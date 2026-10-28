import { ArrowDown, ArrowUp, Copy, DotsThreeVertical, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type Key, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "./button";
import { Menu } from "./menu";

type Adding =
  | {
      /** Adds an item at the end, from a button under the list. */
      onAdd: () => void;
      /** Names that button for what it adds, such as “Add condition”. */
      addLabel: string;
    }
  | { onAdd?: never; addLabel?: never };

type EditableListProps<T> = Adding & {
  items: readonly T[];
  /** Names the list for screen readers, such as “Conditions”. */
  label: string;
  /** Names an item, for its menu, such as `Condition ${index + 1}`. */
  itemLabel: (item: T, index: number) => string;
  /** Tells the items apart, so a row keeps its state and its focus as it moves. */
  itemKey: (item: T, index: number) => Key;
  /** An item's own controls. */
  children: (item: T, index: number) => ReactNode;
  /** Moves an item to another place: its menu gets Move up and Move down. */
  onMove?: (from: number, to: number) => void;
  /** Its menu gets Duplicate. */
  onDuplicate?: (index: number) => void;
  /** Its menu gets Remove, last and in red. */
  onRemove?: (index: number) => void;
  /** Rows of an item's own for its menu, above the list's, such as Wrap in group. */
  actions?: (item: T, index: number) => ReactNode;
  className?: string;
};

/**
 * Items the author adds to, reorders and removes, such as a rule's conditions: each row holds an item's controls and a
 * ⋮ menu of what can be done to it, and Add sits under the list. A move is announced, as the row's place is all that
 * changes, and a removal hands the focus to the row that takes its place, or to Add.
 */
export function EditableList<T>({
  items,
  label,
  itemLabel,
  itemKey,
  children,
  onMove,
  onDuplicate,
  onRemove,
  actions,
  onAdd,
  addLabel,
  className,
}: EditableListProps<T>) {
  const list = useRef<HTMLUListElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  // The place of a row just removed, whose focus goes to the row now there once the list redraws
  const removed = useRef<number | null>(null);

  useEffect(() => {
    const at = removed.current;

    if (at === null) return;
    removed.current = null;
    const menus = list.current?.querySelectorAll<HTMLElement>("[data-row-menu]") ?? [];
    (menus[Math.min(at, menus.length - 1)] ?? add.current)?.focus();
  });

  const move = (from: number, to: number) => {
    onMove?.(from, to);
    setMessage(`Moved ${to < from ? "up" : "down"}, now ${to + 1} of ${items.length}`);
  };

  const menu = (item: T, index: number) => {
    const name = `${itemLabel(item, index)} options`;

    return (
      <Menu.Root>
        <Menu.Trigger
          render={<Button icon={<DotsThreeVertical />} aria-label={name} data-row-menu="" />}
        />
        <Menu.Content aria-label={name} align="end">
          {actions && <Menu.Group>{actions(item, index)}</Menu.Group>}
          {(onMove || onDuplicate) && (
            <Menu.Group>
              {onMove && (
                <>
                  <Menu.Item
                    icon={<ArrowUp />}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    Move up
                  </Menu.Item>
                  <Menu.Item
                    icon={<ArrowDown />}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    Move down
                  </Menu.Item>
                </>
              )}
              {onDuplicate && (
                <Menu.Item icon={<Copy />} onClick={() => onDuplicate(index)}>
                  Duplicate
                </Menu.Item>
              )}
            </Menu.Group>
          )}
          {onRemove && (
            <Menu.Group>
              <Menu.Item
                variant="danger"
                icon={<Trash />}
                onClick={() => {
                  removed.current = index;
                  onRemove(index);
                }}
              >
                Remove
              </Menu.Item>
            </Menu.Group>
          )}
        </Menu.Content>
      </Menu.Root>
    );
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {items.length > 0 && (
        <ul ref={list} aria-label={label} className="flex min-w-0 flex-col gap-2">
          {items.map((item, index) => (
            <li key={itemKey(item, index)} className="flex min-w-0 items-start gap-1">
              <div className="min-w-0 flex-1">{children(item, index)}</div>
              {(actions || onMove || onDuplicate || onRemove) && menu(item, index)}
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <Button ref={add} icon={<Plus />} onClick={onAdd} className="self-start">
          {addLabel}
        </Button>
      )}
      <p role="status" className="sr-only">
        {message}
      </p>
    </div>
  );
}
