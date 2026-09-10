import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  RecipeFieldDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import { getRegistryItem } from "@govtech-bb/form-builder";
import { resolveFieldLabel } from "./-field-label";
import styles from "../../styles/builder.module.css";

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
 * fight the Edit / × / arrow button clicks. The handle is a pointer-only
 * affordance kept out of the tab order — keyboard reordering stays on the
 * ▲/▼ arrow buttons, which remain fully focusable.
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
    <div ref={setNodeRef} className={styles.fieldRow} style={style}>
      <Button
        type="button"
        className={styles.dragHandle}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        tabIndex={-1}
        variant="secondary"
        size="sm"
      >
        ⠿
      </Button>
      <div style={{ flex: 1 }}>
        <div>
          {hasOverrides && (
            <span className={styles.overrideDot} title="Has overrides" />
          )}
          {label}
        </div>
        {showSecondary && (
          <div className={styles.fieldRowSecondary}>{displayName}</div>
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
