// The tool's popups: white, lifted off the page by a shadow, so they never pass for one of the form's ink-bordered
// controls. Shared by selects, menus and submenus.

/** The panel every menu and popover sits in. */
export const panel = "rounded-sm bg-white font-sans shadow-popup outline-none";

export const popup = `flex max-h-(--available-height) min-w-(--anchor-width) max-w-[min(700px,calc(100vw-50px))] flex-col overflow-hidden ${panel} transition duration-180 ease-out-cubic data-ending-style:-translate-y-1.25 data-ending-style:opacity-0 data-ending-style:duration-140 data-starting-style:-translate-y-1.25 data-starting-style:opacity-0 motion-reduce:transition-none`;

export const list =
  "flex min-h-0 flex-col overflow-y-auto p-1.25 outline-none max-[480px]:max-h-none max-[480px]:overflow-y-visible max-[480px]:px-2.5";

// The highlighted row is navy with white text, the state you can find at a glance when arrowing through
export const option =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-14 leading-[1.3] text-ink outline-none select-none data-disabled:cursor-not-allowed data-disabled:text-subtle data-highlighted:bg-blue-80 data-highlighted:text-white data-selected:font-semibold max-[480px]:min-h-11 max-[480px]:gap-2.5 max-[480px]:p-2.5 max-[480px]:text-16 max-[480px]:leading-[1.4] [&>svg]:shrink-0 [&>svg]:text-muted data-highlighted:[&>svg]:text-white";

/** The ✓ at the end of the selected option. */
export const check =
  "mt-px ml-auto inline-flex size-3.5 shrink-0 items-center justify-center text-interactive in-data-highlighted:text-white [&>svg]:size-full";
