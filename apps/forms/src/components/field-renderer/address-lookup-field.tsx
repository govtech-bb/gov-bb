import { JSX, useEffect, useRef, useState } from "react";
import ErrorMessage from "../error-message";
import {
  GeocodeResult,
  MIN_QUERY_LENGTH,
  searchAddresses,
} from "../../lib/api/geocode";
import { FieldRenderContext } from "./render-context";

// Wait for a typing pause before querying — keeps request volume within the
// /geocode throttle and eases load on the upstream Nominatim rate limit.
const DEBOUNCE_MS = 400;

/**
 * A single-line address field backed by the Barbados-locked `/geocode` proxy.
 * As the applicant types (past {@link MIN_QUERY_LENGTH}), it offers matching
 * Barbados addresses in an ARIA combobox listbox; picking one stores its
 * formatted-address string. The value is always the string in the box, so free
 * typing works and a lookup outage degrades to a plain text field (with a
 * non-blocking notice) rather than blocking the form.
 */
export function AddressLookupField({
  ctx,
}: {
  ctx: FieldRenderContext;
}): JSX.Element {
  const {
    field,
    form,
    f,
    sharedProps,
    requiredProps,
    invalid,
    hintId,
    errorId,
    errorMessage,
    labelClass,
    commitChange,
  } = ctx;

  // Sibling field ids share this field's step prefix (id = `<prefix><fieldId>`).
  const stepPrefix = field.id.slice(0, field.id.length - field.fieldId.length);
  const siblingId = (fieldId: string) => `${stepPrefix}${fieldId}`;

  const initial = typeof f.state.value === "string" ? f.state.value : "";
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupFailed, setLookupFailed] = useState(false);

  // The last committed selection — suppresses the lookup that a select would
  // otherwise trigger by changing the input's text.
  const justSelected = useRef(false);
  const listboxId = `${field.id}-listbox`;

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(trimmed, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setActiveIndex(-1);
          setOpen(results.length > 0);
          setLookupFailed(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setSuggestions([]);
          setOpen(false);
          setLookupFailed(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const update = (next: string) => {
    setQuery(next);
    commitChange(next);
  };

  const select = (result: GeocodeResult) => {
    justSelected.current = true;
    // Line 1 holds the street part; fall back to the full label if unparsed.
    const line1 = result.line1 || result.label;
    setQuery(line1);
    commitChange(line1);

    const targets = field.geocodeTargets;
    if (targets?.line2FieldId) {
      form.setFieldValue(siblingId(targets.line2FieldId), result.line2);
    }
    // Only set the parish when resolved, so we never clobber a manual choice.
    if (targets?.parishFieldId && result.parish) {
      form.setFieldValue(siblingId(targets.parishFieldId), result.parish);
    }
    if (targets?.coordinatesFieldId) {
      form.setFieldValue(
        siblingId(targets.coordinatesFieldId),
        `${result.lat},${result.lon}`,
      );
    }

    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Enter":
        if (activeIndex >= 0) {
          event.preventDefault();
          select(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  const activeId =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="govbb-form-group" data-field-width={field.ui?.width}>
      <label className={labelClass("govbb-label")} htmlFor={field.id}>
        {field.label}
      </label>
      {field.hint && (
        <p className="govbb-hint" id={hintId}>
          {field.hint}
        </p>
      )}
      <ErrorMessage id={errorId} message={errorMessage} />
      <div className="govbb-address-lookup">
        <div className="govbb-input-wrapper">
          <input
            id={sharedProps.id}
            name={sharedProps.name}
            disabled={sharedProps.disabled}
            placeholder={sharedProps.placeholder}
            aria-describedby={sharedProps["aria-describedby"]}
            {...requiredProps}
            type="text"
            className="govbb-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-invalid={invalid}
            autoComplete="off"
            value={query}
            onChange={(e) => update(e.target.value)}
            onBlur={() => {
              // Delay so a mouse click on an option registers before we close.
              setTimeout(() => setOpen(false), 150);
              // TanStack Form's blur handler takes no arguments.
              sharedProps.onBlur?.();
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        {open && suggestions.length > 0 && (
          <ul
            className="govbb-address-suggestions"
            role="listbox"
            id={listboxId}
          >
            {suggestions.map((result, index) => (
              <li
                key={`${result.label}-${index}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className="govbb-address-suggestion"
                // onMouseDown (not onClick) so it fires before the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(result);
                }}
              >
                {result.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {lookupFailed && (
        <p className="govbb-hint" role="status">
          Address suggestions are unavailable right now — you can type the
          address yourself.
        </p>
      )}
    </div>
  );
}
