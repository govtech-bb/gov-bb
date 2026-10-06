/** An illustration: respondent controls and sampled answers are never stored in the editor. */
export function OpeningHours() {
  return (
    <div className="relative mb-(--form-gap) has-[[data-optional]:not([hidden])]:pt-7">
      <span
        data-optional=""
        hidden
        aria-hidden="true"
        className="absolute -top-7 right-0 text-16 leading-6 font-normal whitespace-nowrap text-muted select-none"
      >
        (optional)
      </span>
      <div aria-hidden="true" className="divide-y divide-line rounded-sm border border-line px-3">
        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
          (day) => (
            <div key={day} className="flex flex-wrap items-center gap-3 py-3 text-16">
              <span className="w-24 font-semibold">{day}</span>
              <span className="flex items-center gap-2">
                <span data-drawn="" className="h-9 w-20 rounded-sm border-2 border-ink bg-input" />{" "}
                to{" "}
                <span data-drawn="" className="h-9 w-20 rounded-sm border-2 border-ink bg-input" />
              </span>
              <span className="text-muted">Not open</span>
              <span className="ms-auto font-semibold text-interactive">Add hours</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function OpeningHoursPreview() {
  return (
    <div className="divide-y divide-line">
      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
        <div key={day} className="flex justify-between gap-2 py-2 text-14">
          <strong>{day}</strong>
          <span className="text-muted">Not open</span>
          <span className="text-interactive">Add hours</span>
        </div>
      ))}
    </div>
  );
}
