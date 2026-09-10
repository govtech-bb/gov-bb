import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import type {
  RecipeFieldDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import { getRegistryItem } from "@govtech-bb/form-builder";
import { resolveFieldLabel } from "./field-label";

interface SortableFieldRowProps {
  field: RecipeFieldDraft;
  catalog: RegistryCatalog;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * A single, drag-sortable field row within the step editor.
 *
 * Dragging is via a dedicated grip handle (not the whole row) so it doesn't
 * fight the Edit / × / arrow button clicks. The handle supports pointer and
 * keyboard dragging; the arrow buttons offer single-step reordering.
 */
export function SortableFieldRow({
  field,
  catalog,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}: SortableFieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const item = getRegistryItem(field.ref, catalog);
  const label = resolveFieldLabel(field, item);
  const displayName = item?.displayName ?? field.ref;
  const showSecondary = displayName !== label;
  const hasOverrides =
    Object.keys(field.overrides ?? {}).length > 0 ||
    (field.kind === "block" &&
      Object.keys(field.childOverrides ?? {}).length > 0);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      data-field-row
      className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-ui-hairline bg-ui-base px-3 py-2.25 transition-[border-color] duration-120 ease-[ease] hover:border-ui-inactive"
      style={style}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded border-0 bg-ui-base p-1 text-ui-subtle outline-hidden hover:bg-ui-recessed focus-visible:ring-2 focus-visible:ring-ui-brand active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon size={18} aria-hidden="true" />
      </button>
      <div style={{ flex: 1 }}>
        <div>
          {hasOverrides && (
            <span
              className="mr-1.5 inline-block size-2 rounded-full bg-(--ui-warning-text) align-middle"
              title="Has overrides"
            />
          )}
          {label}
        </div>
        {showSecondary && (
          <div className="text-[12px] text-ui-subtle">{displayName}</div>
        )}
      </div>
      <Badge variant="secondary">{field.kind}</Badge>
      <Button
        type="button"
        title="Move up"
        disabled={isFirst}
        onClick={onMoveUp}
        variant="secondary"
        size="sm"
        aria-label={"Move up"}
      >
        ▲
      </Button>
      <Button
        type="button"
        title="Move down"
        disabled={isLast}
        onClick={onMoveDown}
        variant="secondary"
        size="sm"
        aria-label={"Move down"}
      >
        ▼
      </Button>
      <Button type="button" onClick={onEdit} variant="secondary" size="sm">
        Edit
      </Button>
      <Button type="button" onClick={onRemove} variant="secondary" size="sm">
        ×
      </Button>
    </div>
  );
}
