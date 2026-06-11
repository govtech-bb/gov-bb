const PILL_BTN =
  "rounded-full border-[1.5px] border-teal-00 bg-transparent px-3.5 py-1.5 font-medium text-sm text-teal-00 transition-colors hover:bg-teal-00 hover:text-white-00 focus-visible:outline-2 focus-visible:outline-teal-00 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-teal-00";

// One row of single-pick answer buttons, shared by present_choices and
// ask_field's closed-set fields. role=group ties the buttons to the question
// so screen readers announce them as one labelled set, not loose buttons.
export function ChoicePills({
  questionId,
  question,
  labelledBy,
  choices,
  disabled = false,
  onPick,
}: {
  questionId: string;
  question?: string;
  // Set when the question text is rendered elsewhere (ask_field's label).
  labelledBy?: string;
  choices: string[];
  disabled?: boolean;
  onPick: (choice: string) => void;
}) {
  const groupLabelledBy = labelledBy ?? (question ? questionId : undefined);
  return (
    <div className="flex flex-col gap-2.5">
      {question && (
        <p id={questionId} className="text-bubble font-medium text-black-00">
          {question}
        </p>
      )}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={groupLabelledBy}
        aria-label={groupLabelledBy ? undefined : "Answer choices"}
      >
        {choices.map((choice) => (
          <button
            className={PILL_BTN}
            disabled={disabled}
            key={choice}
            onClick={() => onPick(choice)}
            type="button"
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}
