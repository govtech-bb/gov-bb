import { LinkBreak, PencilSimple } from "@phosphor-icons/react";
import type { ComponentProps, MouseEvent } from "react";
import { Button } from "./button";
import { LinkForm } from "./link-picker";
import { belowBar, Popover } from "./popover";
import { Tip } from "./tooltip";

// Its buttons leave the focus, and the caret, in the text
const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * Where the link or button at the caret goes: its address under it, with Edit and Remove, whenever the
 * caret is in it. Edit, or ⌘K, puts the link's form in its place. It never takes the focus by itself, so typing goes
 * on; Esc closes it.
 */
export function LinkAtCaret({
  anchor,
  url,
  fallback,
  label = "Link",
  editLabel = "Edit link",
  removeLabel = "Remove link",
  editing,
  onEditingChange,
  onRemove,
  onClose,
  pages,
  toAddress,
  onApply,
}: {
  /** The link or button it sits under, or the caret for a new link. */
  anchor: ComponentProps<typeof Popover.Content>["anchor"];
  /** Where it goes; undefined where it has no address of its own. */
  url?: string;
  /** What it shows without an address, such as "Linked form". */
  fallback?: string;
  /** Its name: what has the address. */
  label?: string;
  editLabel?: string;
  removeLabel?: string;
  /** Whether the form is open in place of the address. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Takes the address away, where the link or button can do without one. */
  onRemove?: () => void;
  /** Esc, or a press outside it while the form is open. */
  onClose: () => void;
} & Pick<ComponentProps<typeof LinkForm>, "pages" | "toAddress" | "onApply">) {
  return (
    // Shown, it closes only with Esc: it goes when the caret or the focus leaves the link
    <Popover.Root
      open
      onOpenChange={(open, { reason }) =>
        !open && (editing || reason === "escape-key") && onClose()
      }
    >
      <Popover.Content
        aria-label={label}
        anchor={anchor}
        side="bottom"
        align="start"
        collisionPadding={belowBar()}
        initialFocus={editing}
        finalFocus={false}
        className="p-0"
      >
        {editing ? (
          <LinkForm
            url={url}
            pages={pages}
            toAddress={toAddress}
            onApply={onApply}
            onRemove={onRemove}
            removeLabel={removeLabel}
          />
        ) : (
          <div className="flex max-w-[min(28rem,calc(100vw-2rem))] items-center gap-0.5 py-1 ps-3 pe-1">
            <span title={url ?? fallback} className="min-w-0 truncate pe-2 text-14 text-muted">
              {url ?? fallback}
            </span>
            <Tip content={editLabel}>
              <Button
                aria-label={editLabel}
                icon={<PencilSimple />}
                onMouseDown={keepFocus}
                onClick={() => onEditingChange(true)}
              />
            </Tip>
            {onRemove && (
              <Tip content={removeLabel}>
                <Button
                  aria-label={removeLabel}
                  icon={<LinkBreak />}
                  onMouseDown={keepFocus}
                  onClick={onRemove}
                />
              </Tip>
            )}
          </div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
