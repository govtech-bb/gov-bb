import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import { PARISHES } from '../-lib/parishes'

export default function OutageMap({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<string, number>
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <MapContainer
      center={[13.19, -59.54]}
      className="water-outages-map-canvas"
      scrollWheelZoom={false}
      zoom={11}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {PARISHES.map((parish) => {
        const count = counts[parish.value] ?? 0
        const isSelected = selected === parish.value
        return (
          <CircleMarker
            center={[parish.lat, parish.lon]}
            eventHandlers={{ click: () => onSelect(parish.value) }}
            key={parish.value}
            pathOptions={{
              color: isSelected
                ? 'var(--govbb-blue-90)'
                : 'var(--govbb-grey-80)',
              weight: isSelected ? 4 : 1,
              fillColor:
                count > 0 ? 'var(--govbb-red-40)' : 'var(--govbb-blue-40)',
              fillOpacity: 0.8,
            }}
            radius={count > 0 ? 11 + Math.min(count, 4) * 2 : 8}
          >
            <Tooltip>
              {parish.label}: {count} {count === 1 ? 'notice' : 'notices'}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
