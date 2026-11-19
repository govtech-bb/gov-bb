// GovBB's own controls, drawn once for everywhere the editor shows them: the form canvas, the insert dialog's previews
// (which show each field as the canvas draws it) and a page's buttons (page.css applies the button utilities). They
// size themselves from the form's variables in index.css: --form-control, --form-marker, --form-text and
// --field-width, a question's field width.

/** GovBB's input frame (`govbb-input`): a 2px ink border and its one radius. */
export const govbbBox = "rounded-sm border-2 border-ink bg-input";

/**
 * A box stops at its question's field width, short or medium from 768px up: index.css sets it from the `data-width`
 * on a question's blocks, or on a preview's drawing. Otherwise the box fills the column.
 */
export const govbbFieldWidth = "max-w-[var(--field-width,100%)]";

/** A checkbox's square, at the form's marker size. */
export const govbbCheckbox = "size-(--form-marker) shrink-0 border-2 border-ink bg-white";

/** A radio's circle. */
export const govbbRadio = `${govbbCheckbox} rounded-full`;

/** The text beside a checkbox or a radio: its first line centred on the marker. */
export const govbbMarkerLabel = "pt-[calc((var(--form-marker)_-_1.5em)/2)]";

/**
 * GovBB's select (`govbb-select`): a box no wider than its question's field width, or 30rem, then the caret's cell at its
 * end, ruled off.
 */
export const govbbSelect = `flex h-(--form-control) max-w-[var(--field-width,30rem)] items-stretch ${govbbBox}`;

export const govbbSelectCaret =
  "flex w-12 items-center justify-center border-l-2 border-ink bg-grey-10";

/** GovBB's button, from the `govbb-button` utility in index.css, which page.css applies to a page's buttons too. */
export const govbbButton = "govbb-button";

export const govbbSecondaryButton = "govbb-button govbb-button-secondary";

/** "(optional)" after a label, muted and regular weight: GovBB marks what's optional, never what's required. */
export const govbbOptional = "font-normal whitespace-nowrap text-muted select-none";
