// One row of single-pick answer buttons for a choice field. role=group ties the
// buttons to the question label so screen readers announce them as one set.
// Ported clean from the old app's choice-pills (the WHAT); brand teal pills.
export function ChoicePills({
  labelledBy,
  choices,
  disabled = false,
  onPick,
}: {
  labelledBy?: string;
  choices: string[];
  disabled?: boolean;
  onPick: (choice: string) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Answer choices"}
    >
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          disabled={disabled}
          onClick={() => onPick(choice)}
          className="rounded-full border-[1.5px] border-teal-00 bg-transparent px-3.5 py-1.5 text-bubble font-medium text-teal-00 transition-colors hover:bg-teal-00 hover:text-white focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-teal-00"
        >
          {choice}
        </button>
      ))}
    </div>
  );
}
