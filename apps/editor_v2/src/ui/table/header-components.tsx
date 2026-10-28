import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { cn } from "../../cn";
import { useHeaderContext } from "./table-hooks";

/**
 * The column's label as a sort toggle; the unsorted arrows stay faint so the sorted column leads. A column that can't
 * sort keeps its label in a box as tall as the toggle, so every table's header row is one height. The box is a full
 * width block, so a label aligned to the end still reaches the end.
 */
export function SortButton() {
  const header = useHeaderContext();
  const sorted = header.column.getIsSorted();

  if (!header.column.getCanSort())
    return (
      <div className="flex min-h-8 flex-col justify-center">
        <header.FlexRender />
      </div>
    );
  const Icon = sorted === "asc" ? CaretUp : sorted === "desc" ? CaretDown : CaretUpDown;

  return (
    <button
      type="button"
      className={cn(
        "group/sort -mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-sm px-1.5 transition-colors duration-150 hover:bg-tint hover:text-ink",
        sorted && "text-ink",
      )}
      onClick={header.column.getToggleSortingHandler()}
    >
      <header.FlexRender />
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", !sorted && "text-grey-60 group-hover/sort:text-ink")}
      />
    </button>
  );
}
