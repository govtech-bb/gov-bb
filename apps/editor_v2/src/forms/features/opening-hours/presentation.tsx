import { cn } from "../../../cn";
import { govbbBox, govbbOptional } from "../../../ui/govbb";
import { onEdge, optionalRoom } from "../../editor/answer-dom";

/** An illustration: respondent controls and sampled answers are never stored in the editor. */
export function OpeningHours() {
  return (
    <div className={cn("relative mb-(--form-gap)", optionalRoom)}>
      <span data-optional="" hidden aria-hidden="true" className={cn(onEdge, govbbOptional)}>
        (optional)
      </span>
      <div aria-hidden="true" className="divide-y divide-line rounded-sm border border-line px-3">
        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
          (day) => (
            <div key={day} className="flex flex-wrap items-center gap-3 py-3 text-16">
              <span className="w-24 font-semibold">{day}</span>
              <span className="flex items-center gap-2">
                <span data-drawn="" className={cn("h-9 w-20", govbbBox)} />
                to <span data-drawn="" className={cn("h-9 w-20", govbbBox)} />
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
