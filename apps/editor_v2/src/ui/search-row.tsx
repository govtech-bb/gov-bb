import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { MagnifyingGlass } from "@phosphor-icons/react";

/**
 * A search box across the top of a list, in a popup or a panel: a magnifier, then the words, ruled off from the rows
 * under it and starting where their text does. Its props go to the input; `render` swaps that, for a Combobox's own.
 */
export function SearchRow({ render, ...props }: useRender.ComponentProps<"input">) {
  const input = useRender({
    defaultTagName: "input",
    render,
    props: mergeProps<"input">(
      {
        type: "text",
        className:
          "h-9 min-w-0 flex-1 bg-transparent text-14 text-ink outline-none placeholder:text-placeholder pointer-coarse:min-h-11 max-sm:text-16",
      },
      props,
    ),
  });

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 text-muted [&>svg]:size-4 [&>svg]:shrink-0">
      <MagnifyingGlass aria-hidden="true" />
      {input}
    </div>
  );
}
