import "leaflet/dist/leaflet.css";
import { divIcon, latLngBounds, type Marker as LeafletMarker } from "leaflet";
import { JSX, useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

/** Barbados, with a small margin round the coast — the pin cannot leave it. */
const BARBADOS = latLngBounds([13.03, -59.66], [13.34, -59.41]);
const CENTRE: [number, number] = [13.19, -59.54];
// One arrow-key press moves the pin about 50 metres.
const NUDGE_DEGREES = 0.0005;
const NUDGE: Record<string, [number, number]> = {
  ArrowUp: [NUDGE_DEGREES, 0],
  ArrowDown: [-NUDGE_DEGREES, 0],
  ArrowLeft: [0, -NUDGE_DEGREES],
  ArrowRight: [0, NUDGE_DEGREES],
};

const PIN_ICON = divIcon({
  className: "address-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Keep a placed pin inside Barbados, so it always routes to a polyclinic. */
function clampToBarbados(lat: number, lon: number): [number, number] {
  return [
    clamp(lat, BARBADOS.getSouth(), BARBADOS.getNorth()),
    clamp(lon, BARBADOS.getWest(), BARBADOS.getEast()),
  ];
}

function PlaceOnClick({
  onPlace,
}: {
  onPlace: (lat: number, lon: number) => void;
}): null {
  useMapEvents({ click: (e) => onPlace(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * A map of Barbados with one pin the applicant moves to where their address is
 * — by dragging it, clicking or tapping the map, or focusing the pin and using
 * the arrow keys. Shown only when address suggestions are unavailable, so the
 * applicant can still give us a location to route their application by.
 */
export default function LocationPinMap({
  value,
  onChange,
  describedBy,
}: {
  /** The placed pin, or null before the applicant has moved it. */
  value: [number, number] | null;
  onChange: (lat: number, lon: number) => void;
  describedBy: string;
}): JSX.Element {
  const marker = useRef<LeafletMarker>(null);
  const position = value ?? CENTRE;

  const place = (lat: number, lon: number) => {
    const [clampedLat, clampedLon] = clampToBarbados(lat, lon);
    onChange(clampedLat, clampedLon);
  };

  useEffect(() => {
    const element = marker.current?.getElement();
    if (!element) return;
    element.setAttribute("role", "button");
    element.setAttribute(
      "aria-label",
      "Map pin for your address. Use the arrow keys to move it.",
    );
    element.setAttribute("aria-describedby", describedBy);

    const handleKeyDown = (event: KeyboardEvent) => {
      const step = NUDGE[event.key];
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const current = marker.current?.getLatLng();
      if (current) place(current.lat + step[0], current.lng + step[1]);
    };
    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <MapContainer
      center={position}
      className="address-pin-map"
      maxBounds={BARBADOS.pad(0.1)}
      maxBoundsViscosity={1}
      minZoom={10}
      scrollWheelZoom={false}
      zoom={value ? 16 : 11}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PlaceOnClick onPlace={place} />
      <Marker
        draggable
        eventHandlers={{
          dragend: () => {
            const current = marker.current?.getLatLng();
            if (current) place(current.lat, current.lng);
          },
        }}
        icon={PIN_ICON}
        position={position}
        ref={marker}
      />
    </MapContainer>
  );
}
