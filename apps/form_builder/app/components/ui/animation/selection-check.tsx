/** Stroke-based check shared by select, combobox, and menu indicators. */
export function SelectionCheck() {
  return (
    <svg
      aria-hidden="true"
      className="ui-selection-check size-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12L9 17L20 6" pathLength="1" />
    </svg>
  );
}
