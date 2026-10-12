import { JSX, lazy, Suspense, useEffect, useRef, useState } from "react";
import { FormGroup, Hint, Label } from "@govtech-bb/react";
import ErrorMessage from "../error-message";
import {
  GeocodeResult,
  MIN_QUERY_LENGTH,
  resolvePlace,
  reverseGeocode,
  searchAddresses,
} from "../../lib/api/geocode";
import { AddressCombobox } from "./address-combobox";
import { FieldRenderContext } from "./render-context";

// Leaflet is only needed when address suggestions are down or find nothing, so
// it stays out of the main bundle.
const LocationPinMap = lazy(() => import("./location-pin-map"));

// Wait for a typing pause before querying — keeps request volume within the
// /geocode throttle and eases load on the upstream Nominatim rate limit.
const DEBOUNCE_MS = 400;
// Wait for the pin to settle before looking up its address — arrow keys move it
// one nudge at a time.
const PIN_SETTLE_MS = 500;

/**
 * A single-line address field backed by the Barbados-locked `/geocode` proxy.
 * As the applicant types (past {@link MIN_QUERY_LENGTH}), it offers matching
 * Barbados addresses in an ARIA combobox listbox; picking one stores its
 * formatted-address string. The value is always the string in the box, so free
 * typing works and a lookup outage never blocks the form: the field degrades to
 * plain text entry, and — when it writes a routing coordinate — offers a map
 * the applicant places a pin on instead.
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
  // The lookup answered but found nothing for what was typed.
  const [noMatch, setNoMatch] = useState(false);
  // The pin the applicant placed on the fallback map. While set, the routing
  // coordinate belongs to the pin, not to the address text.
  const [pin, setPin] = useState<[number, number] | null>(null);
  const coordinatesFieldId = field.geocodeTargets?.coordinatesFieldId;
  // Once suggestions have failed, or the applicant has asked for the map, keep
  // it up even if a later lookup succeeds, so it does not vanish while they are
  // placing the pin.
  const [showPinMap, setShowPinMap] = useState(false);
  const pinHintId = `${field.id}-pin-hint`;
  // Opening the map from the no-match link removes the link, so focus moves to
  // the map's guidance rather than dropping to the page.
  const focusPinHint = useRef(false);
  useEffect(() => {
    if (!showPinMap || !focusPinHint.current) return;
    focusPinHint.current = false;
    document.getElementById(pinHintId)?.focus();
  }, [showPinMap, pinHintId]);

  // The last committed selection — suppresses the lookup that a select would
  // otherwise trigger by changing the input's text.
  const justSelected = useRef(false);
  // The picked place whose coordinate is still being looked up. Cleared when
  // the applicant edits the address, so a late answer is not written.
  const pendingPlace = useRef<GeocodeResult | null>(null);
  // Groups this applicant's keystrokes and their pick into one billed lookup
  // session; a pick ends it.
  const session = useRef<string | null>(null);
  // Bumped by every pin move and every edit, so only the latest pin's address
  // is written, and never over something the applicant typed since.
  const pinLookup = useRef(0);
  const pinTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pinTimer.current), []);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setNoMatch(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      session.current ??= crypto.randomUUID();
      searchAddresses(trimmed, controller.signal, session.current)
        .then((results) => {
          setSuggestions(results);
          setLookupFailed(false);
          setNoMatch(results.length === 0);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setSuggestions([]);
          setNoMatch(false);
          setLookupFailed(true);
          if (coordinatesFieldId) setShowPinMap(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, coordinatesFieldId]);

  const update = (next: string) => {
    setQuery(next);
    commitChange(next);
    pendingPlace.current = null;
    pinLookup.current += 1;
    // The coordinate belongs to the suggestion that was picked, and the
    // applicant cannot see it (it is a `ui.hidden` field), so editing the
    // address by hand would otherwise send the CMS a precise coordinate for an
    // address that is no longer on screen — and route the application to the
    // polyclinic serving the OLD one. Drop it and let the server fill the
    // coordinate from the parish instead. The parish and line 2 stay: both are
    // visible fields the applicant can correct themselves. A placed pin is the
    // applicant's own answer for the location, so it survives the edit.
    if (coordinatesFieldId && !pin) {
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
        result.lat && result.lon ? `${result.lat},${result.lon}` : "",
      );
    }
    // The pick replaces any pin: drop it, close the map, and let no late
    // address-at-the-pin answer overwrite the pick.
    setPin(null);
    setShowPinMap(false);
    pinLookup.current += 1;
    setSuggestions([]);

    // A place suggestion has no coordinate yet: look it up, in the same
    // session as the searches (which ends it).
    const sessionToken = session.current ?? undefined;
    session.current = null;
    if (!result.placeId || result.lat) return;
    pendingPlace.current = result;
    resolvePlace(result.placeId, sessionToken)
      .then((place) => {
        if (pendingPlace.current !== result) return;
        pendingPlace.current = null;
        if (targets?.coordinatesFieldId) {
          form.setFieldValue(
            siblingId(targets.coordinatesFieldId),
            `${place.lat},${place.lon}`,
          );
        }
        if (targets?.parishFieldId && !result.parish && place.parish) {
          form.setFieldValue(siblingId(targets.parishFieldId), place.parish);
        }
      })
      .catch(() => {
        if (pendingPlace.current !== result) return;
        pendingPlace.current = null;
        // No coordinate for the pick: let the applicant place the pin instead.
        if (coordinatesFieldId) setShowPinMap(true);
      });
  };

  const placePin = (lat: number, lon: number) => {
    if (!coordinatesFieldId) return;
    setPin([lat, lon]);
    form.setFieldValue(
      siblingId(coordinatesFieldId),
      `${lat.toFixed(6)},${lon.toFixed(6)}`,
    );

    // Fill the address lines with the address at the pin once it settles. The
    // coordinate stays the pin's own: the address is a description of it.
    const lookup = ++pinLookup.current;
    clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => {
      reverseGeocode(lat, lon)
        .then((found) => {
          if (lookup !== pinLookup.current || !found.line1) return;
          justSelected.current = true;
          setQuery(found.line1);
          commitChange(found.line1);
          const targets = field.geocodeTargets;
          if (targets?.line2FieldId) {
            form.setFieldValue(siblingId(targets.line2FieldId), found.line2);
          }
          if (targets?.parishFieldId && found.parish) {
            form.setFieldValue(siblingId(targets.parishFieldId), found.parish);
          }
        })
        // No address there, or the lookup is down: the applicant types it.
        .catch(() => {});
    }, PIN_SETTLE_MS);
  };

  const openPinMap = () => {
    focusPinHint.current = true;
    setShowPinMap(true);
  };

  // A placed pin stays the routing coordinate; only the map goes. Focus returns
  // to the address, as the button that had it is gone.
  const hidePinMap = () => {
    setShowPinMap(false);
    document.getElementById(field.id)?.focus();
  };

  return (
    <FormGroup data-field-width={field.ui?.width}>
      <Label
        className={field.ui?.hideLabel ? "govbb-visually-hidden" : undefined}
        htmlFor={field.id}
        optional={labelSuffix !== null}
      >
        {field.label}
      </Label>
      {field.hint && <Hint id={hintId}>{field.hint}</Hint>}
      <ErrorMessage id={errorId} message={errorMessage} />
      <AddressCombobox
        id={sharedProps.id}
        name={sharedProps.name}
        disabled={sharedProps.disabled}
        placeholder={sharedProps.placeholder}
        aria-describedby={sharedProps["aria-describedby"]}
        {...requiredProps}
        aria-invalid={invalid}
        listLabel={field.label}
        value={query}
        onValueChange={update}
        onBlur={sharedProps.onBlur}
        suggestions={suggestions}
        onPick={select}
        attribution={suggestions.some((result) => result.placeId)}
      />
      {showPinMap ? (
        <>
          <Hint id={pinHintId} role="status" tabIndex={-1}>
            {lookupFailed
              ? "We cannot suggest addresses at the moment. Type your address, then move the pin on the map to where it is."
              : "Move the pin on the map to where the address is."}
          </Hint>
          <Suspense fallback={null}>
            <LocationPinMap
              value={pin}
              onChange={placePin}
              describedBy={pinHintId}
            />
          </Suspense>
          <p className="address-lookup__map-actions">
            <button
              className="govbb-link address-lookup__map-link"
              onClick={hidePinMap}
              type="button"
            >
              Hide the map
            </button>
          </p>
        </>
      ) : lookupFailed ? (
        <Hint role="status">
          Address suggestions are unavailable right now — you can type the
          address yourself.
        </Hint>
      ) : (
        noMatch &&
        coordinatesFieldId && (
          <Hint role="status">
            We cannot find that address. You can type it yourself, or{" "}
            <button
              className="govbb-link address-lookup__map-link"
              onClick={openPinMap}
              type="button"
            >
              show where it is on a map
            </button>
            .
          </Hint>
        )
      )}
    </FormGroup>
  );
}
