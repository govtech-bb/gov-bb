import { Button } from "../ui/button";
import { DropdownMenu } from "../ui/dropdown";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DotsSixVerticalIcon,
  DotsThreeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  PencilSimpleIcon,
  CopyIcon,
} from "@phosphor-icons/react";
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
  onDuplicate: () => void;
  onRemove: () => void;
}

export function SortableFieldRow({
  field,
  catalog,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDuplicate,
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
  const primitive = item && "primitive" in item ? item.primitive : undefined;
  const hint = field.overrides?.hint ?? primitive?.hint;
  const required =
    field.overrides?.validations?.required ?? primitive?.validations?.required;
  return (
    <div
      ref={setNodeRef}
      data-field-row
      className="group/field mb-3 flex min-w-0 items-start gap-2 rounded-lg border border-ui-hairline bg-ui-base p-3 transition-colors hover:border-ui-line"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="pointer-coarse:size-11 mt-0.5 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ui-subtle hover:bg-ui-tint focus-visible:outline-2 focus-visible:outline-ui-focus active:cursor-grabbing"
        aria-label={`Drag to reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="min-w-0 flex-1 rounded py-1 text-start focus-visible:outline-2 focus-visible:outline-ui-focus"
      >
        <span className="block text-base font-medium text-ui-strong wrap-anywhere">
          {label}
        </span>
        {hint && (
          <span className="mt-1 block text-sm text-ui-subtle wrap-anywhere">
            {hint}
          </span>
        )}
        <span className="mt-2 block text-xs text-ui-subtle">
          {item?.displayName ?? field.ref}
          {primitive &&
            ` · ${required && required.value !== false ? "Required" : "Optional"}`}
          {field.kind === "block" && " · Question group"}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              className="pointer-coarse:size-11"
              aria-label={`Actions for ${label}`}
              icon={<DotsThreeIcon aria-hidden="true" />}
            />
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onClick={onEdit}>
            <PencilSimpleIcon aria-hidden="true" />
            Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={!item} onClick={onDuplicate}>
            <CopyIcon aria-hidden="true" />
            {field.kind === "block"
              ? "Duplicate question group"
              : "Duplicate question"}
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={isFirst} onClick={onMoveUp}>
            <ArrowUpIcon aria-hidden="true" />
            Move up
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={isLast} onClick={onMoveDown}>
            <ArrowDownIcon aria-hidden="true" />
            Move down
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onClick={onRemove} className="text-ui-danger">
            <TrashIcon aria-hidden="true" />
            Remove question
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
}
