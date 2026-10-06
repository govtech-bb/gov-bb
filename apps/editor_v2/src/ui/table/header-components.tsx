import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { cn } from "../../cn";
import { useHeaderContext } from "./hook";

/** The column's label as a sort toggle; the unsorted arrows stay faint so the sorted column leads. */
export function SortButton() {
  const header = useHeaderContext();
  const sorted = header.column.getIsSorted();

  if (!header.column.getCanSort()) return <header.FlexRender />;
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
