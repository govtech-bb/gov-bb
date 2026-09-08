import { JSX, useEffect, useRef, useState } from "react";
import { Autocomplete, FormGroup, Hint, Label } from "@govtech-bb/react";
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
    labelSuffix,
    commitChange,
  } = ctx;

  // Sibling field ids share this field's step prefix (id = `<prefix><fieldId>`).
  const stepPrefix = field.id.slice(0, field.id.length - field.fieldId.length);
  const siblingId = (fieldId: string) => `${stepPrefix}${fieldId}`;

  const initial = typeof f.state.value === "string" ? f.state.value : "";
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [lookupFailed, setLookupFailed] = useState(false);

  // The last committed selection — suppresses the lookup that a select would
  // otherwise trigger by changing the input's text.
  const justSelected = useRef(false);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(trimmed, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setLookupFailed(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setSuggestions([]);
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
    // The coordinate belongs to the suggestion that was picked, and the
    // applicant cannot see it (it is a `ui.hidden` field), so editing the
    // address by hand would otherwise send the CMS a precise coordinate for an
    // address that is no longer on screen — and route the application to the
    // polyclinic serving the OLD one. Drop it and let the server fill the
    // coordinate from the parish instead. The parish and line 2 stay: both are
    // visible fields the applicant can correct themselves.
    const coordinatesFieldId = field.geocodeTargets?.coordinatesFieldId;
    if (coordinatesFieldId) {
      form.setFieldValue(siblingId(coordinatesFieldId), "");
    }
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
  };

  return (
    <FormGroup
      className="form-page__text-field"
      data-field-width={field.ui?.width}
    >
      <Label
        className={field.ui?.hideLabel ? "govbb-visually-hidden" : undefined}
        htmlFor={field.id}
        optional={labelSuffix !== null}
      >
        {field.label}
      </Label>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      <Autocomplete
        id={sharedProps.id}
        name={sharedProps.name}
        disabled={sharedProps.disabled}
        placeholder={sharedProps.placeholder}
        aria-describedby={sharedProps["aria-describedby"]}
        {...requiredProps}
        aria-invalid={invalid}
        value={query}
        onChange={(e) => update(e.target.value)}
        onBlur={sharedProps.onBlur}
        suggestions={suggestions.map((result) => ({
          value: result.line1 || result.label,
          label: result.label,
        }))}
        onSuggestionSelect={(_, index) => select(suggestions[index])}
      />
      {lookupFailed && (
        <Hint role="status">
          Address suggestions are unavailable right now — you can type the
          address yourself.
        </Hint>
      )}
    </FormGroup>
  );
}
