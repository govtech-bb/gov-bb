import {
  Component,
  JSX,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { FormGroup, Hint, Label } from "@govtech-bb/react";
import { v4 as uuidv4 } from "uuid";
import ErrorMessage from "../error-message";
import {
  GeocodeResult,
  locatingPlace,
  lookupPolyclinic,
  MIN_QUERY_LENGTH,
  resolvePlace,
  reverseGeocode,
  ROUTING_COORDINATE,
  searchAddresses,
} from "../../lib/api/geocode";
import { AddressCombobox } from "./address-combobox";
import { FieldRenderContext } from "./render-context";

// Leaflet is only needed when address suggestions are down or find nothing, so
// it stays out of the main bundle.
const LocationPinMap = lazy(() => import("./location-pin-map"));

/**
 * Keeps a map that fails to load (a stale chunk after a deploy) from taking the
 * whole form page down with it: the rest of the page stays, with `fallback` in
 * the map's place.
 */
class MapLoadBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
 * formatted-address string. When the field writes a routing coordinate, the
 * address has to be located — picked from the list or placed on the map, which
 * stays available when the lookup finds nothing or is down; a typed address
 * alone does not pass validation. Without a coordinate, free typing is fine.
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
  // The pin is off the island (no parish there), so it locates nothing.
  const [pinOffshore, setPinOffshore] = useState(false);
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

  // Whether the address (and its coordinate) came from the lookup — a pick or
  // the pin. Editing a picked address drops its coordinate and parish; a pin
  // keeps them. (The parish is locked, set only from the location — see
  // `filledByAddressLookup`.)
  const located = useRef(
    Boolean(coordinatesFieldId) &&
      ROUTING_COORDINATE.test(
        String(form.getFieldValue(siblingId(coordinatesFieldId ?? "")) ?? ""),
      ),
  );
  const markLocated = () => {
    located.current = true;
  };

  // The polyclinic the application will be routed to, once located. Bumped per
  // coordinate so only the latest lookup's answer is shown.
  const [polyclinic, setPolyclinic] = useState<string | null>(null);
  const polyclinicLookup = useRef(0);

  const writeCoordinate = (value: string) => {
    if (!coordinatesFieldId) return;
    form.setFieldValue(siblingId(coordinatesFieldId), value);
    const lookup = ++polyclinicLookup.current;
    setPolyclinic(null);
    if (!value) return;
    // Clear a "find the address" error as soon as it is located.
    if (!f.state.meta.isValid) void f.validate("submit");
    const [lat, lon] = value.split(",").map(Number);
    lookupPolyclinic(lat, lon)
      .then((name) => {
        if (lookup === polyclinicLookup.current) setPolyclinic(name);
      })
      // No polyclinic there, or the lookup is down: say nothing.
      .catch(() => {});
  };

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
      // Not crypto.randomUUID(): it throws outside a secure context.
      session.current ??= uuidv4();
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

  // Line 2, the parish and the coordinate (and pin) were found for one
  // address; once that address changes they go, rather than linger stale.
  const clearFoundDetails = () => {
    const targets = field.geocodeTargets;
    if (targets?.line2FieldId) {
      form.setFieldValue(siblingId(targets.line2FieldId), "");
    }
    if (targets?.parishFieldId) {
      form.setFieldValue(siblingId(targets.parishFieldId), "");
    }
    setPin(null);
    writeCoordinate("");
  };

  const update = (next: string) => {
    // This is typing, so look it up — even if a pick or pin left the flag set
    // by writing text the input already held (no re-render, so never cleared).
    justSelected.current = false;
    setQuery(next);
    commitChange(next);
    pendingPlace.current = null;
    pinLookup.current += 1;
    // Clearing the address starts over.
    if (next.trim() === "") {
      located.current = false;
      clearFoundDetails();
      return;
    }
    // A placed pin is the location and the text only describes it, so the
    // applicant can correct the address the pin filled in and keep the pin.
    if (pin) return;
    // The coordinate belongs to the address that was located, and the
    // applicant cannot see it (it is a `ui.hidden` field), so a typed address
    // must never carry one: it would route the application to the polyclinic
    // serving the OLD address. The locked parish goes with it; line 2 is the
    // applicant's to keep.
    if (located.current) {
      located.current = false;
      setPin(null);
      if (field.geocodeTargets?.parishFieldId) {
        form.setFieldValue(siblingId(field.geocodeTargets.parishFieldId), "");
      }
    }
    if (coordinatesFieldId) writeCoordinate("");
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
    // Only set the parish when resolved; otherwise the coordinate lookup below
    // brings it.
    if (targets?.parishFieldId && result.parish) {
      form.setFieldValue(siblingId(targets.parishFieldId), result.parish);
    }
    writeCoordinate(
      result.lat && result.lon ? `${result.lat},${result.lon}` : "",
    );
    markLocated();
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
    const lookup = resolvePlace(result.placeId, sessionToken)
      .then((place) => {
        if (pendingPlace.current !== result) return;
        pendingPlace.current = null;
        writeCoordinate(`${place.lat},${place.lon}`);
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
    locatingPlace(field.id, lookup);
  };

  const placePin = (lat: number, lon: number) => {
    if (!coordinatesFieldId) return;
    // The pin replaces a pick still being looked up: its late answer must not
    // overwrite the pin.
    pendingPlace.current = null;
    setPinOffshore(false);
    setPin([lat, lon]);
    writeCoordinate(`${lat.toFixed(6)},${lon.toFixed(6)}`);
    markLocated();

    // Fill the address lines with the address at the pin once it settles. The
    // coordinate stays the pin's own: the address is a description of it.
    const lookup = ++pinLookup.current;
    clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => {
      reverseGeocode(lat, lon)
        .then((found) => {
          if (lookup !== pinLookup.current) return;
          const targets = field.geocodeTargets;
          // No parish at the pin means it is in the sea: it routes nowhere, so
          // it locates nothing until the applicant moves it onto the island.
          if (!found.parish) {
            setPinOffshore(true);
            writeCoordinate("");
            if (targets?.parishFieldId) {
              form.setFieldValue(siblingId(targets.parishFieldId), "");
            }
            return;
          }
          // The parish is read-only, so the pin is the only way to set it; the
          // lines only where there is an address.
          if (targets?.parishFieldId) {
            form.setFieldValue(siblingId(targets.parishFieldId), found.parish);
          }
          if (!found.line1) return;
          justSelected.current = true;
          setQuery(found.line1);
          commitChange(found.line1);
          if (targets?.line2FieldId) {
            form.setFieldValue(siblingId(targets.line2FieldId), found.line2);
          }
        })
        // The lookup is down: the pin still locates the address.
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
      {polyclinic && (
        <div className="govbb-warning-text" role="status">
          <span className="govbb-warning-text__icon" aria-hidden="true">
            !
          </span>
          <span className="govbb-visually-hidden">Warning:</span>
          <p>Your request will be routed to {polyclinic}.</p>
        </div>
      )}
      {showPinMap ? (
        <>
          <Hint id={pinHintId} role="status" tabIndex={-1}>
            {pinOffshore
              ? "The pin is in the sea. Move it to where the address is."
              : lookupFailed
                ? "We cannot suggest addresses at the moment. Type your address, then move the pin on the map to where it is."
                : "Move the pin on the map to where the address is."}
          </Hint>
          <MapLoadBoundary
            fallback={
              <Hint role="status">
                We cannot show the map at the moment. Refresh the page to try
                again.
              </Hint>
            }
          >
            <Suspense fallback={null}>
              <LocationPinMap
                value={pin}
                onChange={placePin}
                describedBy={pinHintId}
              />
            </Suspense>
          </MapLoadBoundary>
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
        // A routing address must be located, so when the list cannot place it
        // — nothing found, or Continue refused it — the map is the way on.
        coordinatesFieldId &&
        (noMatch || invalid) && (
          <Hint role="status">
            {noMatch ? "We cannot find that address. " : ""}
            <button
              className="govbb-link address-lookup__map-link"
              onClick={openPinMap}
              type="button"
            >
              Find it on the map
            </button>
            .
          </Hint>
        )
      )}
    </FormGroup>
  );
}
