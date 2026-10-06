import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";
import { cn } from "../../cn";
import { useHeaderContext } from "./hook";

export function SortButton() {
  const header = useHeaderContext();
  const sorted = header.column.getIsSorted();

  if (!header.column.getCanSort()) return <header.FlexRender />;
  const Icon = sorted === "asc" ? CaretUp : sorted === "desc" ? CaretDown : CaretUpDown;

  return (
    <button
      type="button"
      className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 font-semibold hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      onClick={header.column.getToggleSortingHandler()}
    >
      <header.FlexRender />
      <Icon aria-hidden="true" className={cn("size-3.5", !sorted && "text-subtle")} />
    </button>
  );
}
