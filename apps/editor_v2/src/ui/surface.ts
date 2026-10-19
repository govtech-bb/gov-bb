// What the tool's popups share: the white sheet they sit on, how they arrive, and the rows of menus and selects.
// Lists keep the editor's spacing: rows sit 4px in from the sheet's sides, and anything else in a list (headings,
// notes, fields) starts 14px in, level with the rows' text.

/**
 * A control's size under a coarse pointer, such as a finger on a tablet or a hand that shakes: at least 44px each way,
 * so it can't be mistaken for its neighbour, as fields and menu rows grow too. A mouse keeps the compact size.
 */
export const touchTarget = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

/**
 * Every popover and menu has a name, so a screen reader says what opened: a label of its own, or the id of its visible
 * title. A menu's trigger names it otherwise, which a drag handle or a "More" button does badly.
 */
export type PopupName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/** The sheet itself, lifted off the page by the popup shadow so it never passes for one of the form's controls. */
export const surface = "rounded-sm bg-white font-sans text-ink shadow-popup outline-none";

/**
 * Grows out of its trigger (Base UI's --transform-origin) as it fades in, and leaves quicker than it came. Base UI marks
 * the opens and closes that shouldn't animate, such as one made from the keyboard. Reduced motion keeps only the fade.
 */
export const surfaceMotion =
  "origin-(--transform-origin) transition-[opacity,scale] duration-160 ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-100 data-instant:duration-0 motion-safe:data-starting-style:scale-96 motion-safe:data-ending-style:scale-96";

/** The popup of a list of rows: as tall as the screen allows, then it scrolls. */
export const listPopup = `group/popup flex max-h-(--available-height) max-w-[min(28rem,calc(100vw-2rem))] flex-col overflow-y-auto overscroll-contain py-1 ${surface} ${surfaceMotion}`;

/** The popup of a select or a combobox: at least as wide as its field. Its list (`fieldList`) does the scrolling. */
export const fieldPopup = `group/popup flex max-h-(--available-height) max-w-[min(28rem,calc(100vw-2rem))] min-w-(--anchor-width) flex-col overflow-hidden ${surface} ${surfaceMotion}`;

export const fieldList = "min-h-0 overflow-y-auto overscroll-contain py-1 outline-none";

/**
 * A row in a menu or a select, or in a list that marks its highlighted row with `data-highlighted`. Highlighted it turns
 * navy with white text, the row you can find at a glance while arrowing through. A disabled row fades but stays
 * reachable from the keyboard. Where some rows in the popup have an icon, the others indent so every label starts on
 * the same line.
 */
export const row =
  "group/row relative mx-1 flex min-h-8 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-14 text-ink outline-none select-none data-highlighted:bg-blue-80 data-highlighted:text-white data-disabled:pointer-events-none data-disabled:opacity-50 group-has-[[data-icon]]/popup:not-has-[[data-icon]]:ps-8.5 pointer-coarse:min-h-11 max-sm:text-16";

/**
 * "No results" in a list popup, the one line for a search that finds nothing: a row's height, its text where the
 * rows' text starts. Empty, it takes no room, as Base UI's Combobox.Empty stays in the list waiting for its words.
 */
export const listEmpty = "px-3.5 py-1.5 text-14 text-muted empty:hidden";

/** Under a list, what its highlighted row does, changing as the highlight moves. */
export const listFooter =
  "shrink-0 border-t border-line px-3.5 py-2 text-12 leading-4 text-pretty text-muted line-clamp-2";

/** A row that is a plain button rather than a menu item: it highlights on hover and keyboard focus. */
export const buttonRow = `${row} hover:bg-blue-80 hover:text-white focus-visible:bg-blue-80 focus-visible:text-white disabled:pointer-events-none disabled:opacity-50 [&:is(:hover,:focus-visible)_[data-icon]]:text-white`;

/** The icon before a row's label. Carries `data-icon`, which lines up the rows without one. */
export const rowIcon =
  "flex shrink-0 text-muted group-data-highlighted/row:text-white [&>svg]:size-4";

export const rowLabel = "min-w-0 flex-1 truncate";

/** A shortcut, a count or the current choice, at the end of the row. */
export const rowDetail =
  "max-w-[50%] shrink-0 truncate ps-2 text-12 leading-4 text-muted tabular-nums group-data-highlighted/row:text-white/75";

/** The tick on a chosen row. It keeps its space while unticked, so ticking a row never shifts the others. */
export const rowCheck =
  "flex size-4 shrink-0 items-center justify-center text-interactive group-data-highlighted/row:text-white [&>svg]:size-3.5";

/** Rows that belong together, ruled off from the next group. */
export const group = "not-last:mb-1 not-last:border-b not-last:border-line not-last:pb-1";

export const groupLabel = "px-3.5 pt-2 pb-1.5 text-12 leading-4 font-semibold text-muted";

export const separator = "my-1 h-px shrink-0 bg-line";
