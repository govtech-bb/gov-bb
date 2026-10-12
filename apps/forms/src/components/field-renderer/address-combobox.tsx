import {
  InputHTMLAttributes,
  JSX,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { GeocodeResult } from "../../lib/api/geocode";

/**
 * The address field's input and suggestion list — the WAI-ARIA editable
 * combobox, styled with the design system's `.govbb-combobox` classes. It is
 * local to the address field (not `@govtech-bb/react`'s Autocomplete) because
 * each row shows a place's name with the typed part in bold and where it is in
 * a lighter colour, and Google's terms need a "Google Maps" attribution under
 * the list. The parent owns the text and the suggestions.
 */
export function AddressCombobox({
  id,
  listLabel,
  value,
  onValueChange,
  suggestions,
  onPick,
  attribution,
  onBlur,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  id: string;
  /** Names the listbox for assistive technology (the field's label). */
  listLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  suggestions: GeocodeResult[];
  onPick: (result: GeocodeResult) => void;
  /** Show the "Google Maps" attribution under the list. */
  attribution: boolean;
}): JSX.Element {
  // Same id the design-system combobox gives its list, which smoke specs target.
  const listId = `${id}-listbox`;
  const [active, setActive] = useState(-1);
  // Closed by Escape, a pick or leaving the field, until new suggestions land.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setActive(-1);
    setDismissed(false);
  }, [suggestions]);

  const count = suggestions.length;
  const expanded = count > 0 && !dismissed;
  const optionId = (index: number) => `${listId}-${index}`;

  const choose = (index: number) => {
    const result = suggestions[index];
    if (!result) return;
    setDismissed(true);
    onPick(result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (count === 0) return;
      event.preventDefault();
      if (!expanded) {
        setDismissed(false);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        current === -1 && step === -1
          ? count - 1
          : (current + step + count) % count,
      );
    } else if (event.key === "Enter" && expanded && active >= 0) {
      // Pick the highlighted row instead of submitting the form.
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setDismissed(true);
    }
  };

  return (
    <div className="govbb-combobox">
      <input
        {...inputProps}
        id={id}
        className="govbb-input govbb-combobox__input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          setDismissed(true);
          onBlur?.(event);
        }}
      />
      {expanded && (
        <div className="govbb-combobox__list address-combobox__popup">
          <ul
            id={listId}
            role="listbox"
            aria-label={listLabel}
            className="address-combobox__options"
          >
            {suggestions.map((result, index) => (
              <li
                key={`${result.placeId ?? result.label}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className="govbb-combobox__option"
                // Keep focus in the input so the pick lands there.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {result.mainText ? (
                  <>
                    {emphasise(result.mainText, result.matches ?? [])}
                    {result.secondaryText && (
                      <span className="address-combobox__where">
                        {" "}
                        {result.secondaryText}
                      </span>
                    )}
                  </>
                ) : (
                  result.label
                )}
              </li>
            ))}
          </ul>
          {attribution && (
            <p className="address-combobox__attribution" translate="no">
              Google Maps
            </p>
          )}
        </div>
      )}
      <div role="status" className="govbb-visually-hidden">
        {expanded
          ? `${count} ${count === 1 ? "result" : "results"} available`
          : ""}
      </div>
    </div>
  );
}

/** `text` with the matched spans in bold. */
function emphasise(
  text: string,
  matches: { start: number; end: number }[],
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of [...matches].sort((a, b) => a.start - b.start)) {
    if (start < cursor || end <= start) continue;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(<strong key={start}>{text.slice(start, end)}</strong>);
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
