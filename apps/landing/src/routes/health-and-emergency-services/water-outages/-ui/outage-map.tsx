import type {
  CircleMarker as LeafletCircleMarker,
  Map as LeafletMap,
} from 'leaflet'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { PARISHES } from '../-lib/parishes'
import type { Parish } from '../-lib/parishes'

const PAN_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export default function OutageMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>
  selected: string
  onSelect: (value: string) => void
}) {
  const [map, setMap] = useState<LeafletMap | null>(null)

  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    container.setAttribute('role', 'group')
    container.setAttribute(
      'aria-label',
      'Parish map. Use arrow keys to pan and plus or minus to zoom.',
    )
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = PAN_DIRECTIONS[event.key]
      if (!direction || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      const distance = 80 * (event.shiftKey ? 3 : 1)
      const offset: [number, number] = [
        direction[0] * distance,
        direction[1] * distance,
      ]
      const center = map.unproject(map.project(map.getCenter()).add(offset))
      // Leaflet's keyboard pan otherwise animates even with zoomAnimation off.
      map.panTo(center, { animate: false })
    }
    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [map])

  return (
    <MapContainer
      bounceAtZoomLimits={false}
      center={[13.19, -59.54]}
      className="water-outages-map-canvas"
      fadeAnimation={false}
      inertia={false}
      markerZoomAnimation={false}
      maxBounds={[
        [12.99, -59.72],
        [13.38, -59.36],
      ]}
      maxBoundsViscosity={1}
      minZoom={10.5}
      ref={setMap}
      scrollWheelZoom={false}
      zoom={10.5}
      zoomAnimation={false}
      zoomDelta={0.5}
      zoomSnap={0.5}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {PARISHES.map((parish) => (
        <ParishMarker
          count={counts[parish.value] ?? 0}
          key={parish.value}
          onSelect={onSelect}
          parish={parish}
          selected={selected === parish.value}
        />
      ))}
    </MapContainer>
  )
}

function ParishMarker({
  count,
  onSelect,
  parish,
  selected,
}: {
  count: number
  onSelect: (value: string) => void
  parish: Parish
  selected: boolean
}) {
  const marker = useRef<LeafletCircleMarker>(null)
  const map = useMap()
  const label = `${parish.label}: ${count} current ${count === 1 ? 'notice' : 'notices'}`
  const selectParish = useEffectEvent(() => onSelect(parish.value))

  useEffect(() => {
    const element = marker.current?.getElement()
    if (!(element instanceof SVGElement)) return
    element.setAttribute('tabindex', '0')
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', label)
    element.setAttribute('aria-pressed', String(selected))

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      selectParish()
    }
    function handleFocus() {
      map.panInside([parish.lat, parish.lon], {
        animate: false,
        padding: [32, 32],
      })
    }
    element.addEventListener('keydown', handleKeyDown)
    element.addEventListener('focus', handleFocus)
    return () => {
      element.removeEventListener('keydown', handleKeyDown)
      element.removeEventListener('focus', handleFocus)
    }
  }, [label, map, parish, selected])

  return (
    <CircleMarker
      center={[parish.lat, parish.lon]}
      className="water-outages-marker"
      eventHandlers={{ click: () => onSelect(parish.value) }}
      pathOptions={{
        color: selected ? 'var(--govbb-blue-90)' : 'var(--govbb-grey-80)',
        weight: selected ? 4 : 1,
        fillColor: count > 0 ? 'var(--govbb-red-40)' : 'var(--govbb-blue-40)',
        fillOpacity: 0.8,
      }}
      radius={count > 0 ? 11 + Math.min(count, 4) * 2 : 8}
      ref={marker}
    >
      <Tooltip>{label}</Tooltip>
    </CircleMarker>
  )
}
