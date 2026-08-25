/**
 * Emergency shelter result card.
 * --------------------------------------------------------------
 * Presentational — given a shelter (and an optional distance from the user),
 * renders its status, name, capacity, address, amenity tags and a directions
 * link. No finder state.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import type { ReactNode } from 'react'
import type { Shelter } from '../-data/emergency-shelters'
import { formatDistance } from '../-lib/shelter-distance'
import type { ShelterDistance } from '../-lib/shelter-distance'
import { MapPinIcon } from './icons'

function mapsUrl(shelter: Shelter): string {
  const query = encodeURIComponent(
    `${shelter.name}, ${shelter.parish}, Barbados`,
  )
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

const TAG_TONES = {
  category: 'bg-yellow-20 text-blue-40',
  access: 'bg-teal-10 text-teal-80',
  water: 'bg-green-10 text-green-40',
  warning: 'bg-red-10 text-red-80',
} as const

function Tag({
  tone,
  children,
}: {
  tone: keyof typeof TAG_TONES
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-3 py-1 font-semibold text-sm ${TAG_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function ShelterCard({
  shelter,
  distance,
}: {
  shelter: Shelter
  distance: ShelterDistance | null
}) {
  const ownership =
    shelter.ownership === 'Public' ? 'public' : 'privately owned'

  return (
    <li className="flex h-full flex-col gap-xs rounded-lg border-4 border-grey-20 bg-white-00 p-s">
      <p className="inline-flex w-fit items-center gap-2 rounded-full bg-grey-20 px-3 py-1 font-bold text-grey-70 text-xs uppercase tracking-wide">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-grey-70"
        />
        Not currently open
      </p>

      {shelter.restriction && (
        <p className="inline-flex w-fit items-center gap-1 rounded-full bg-red-10 px-3 py-1 font-semibold text-red-80 text-sm">
          <strong>Restricted:</strong> {shelter.restriction}
        </p>
      )}

      <Heading as="h3" size="h3">
        {shelter.name}
      </Heading>

      <Text as="p" className="text-grey-70">
        {shelter.parish}, {ownership}, holds up to {shelter.capacity} people
        (booklet planning figure — not live availability)
      </Text>

      {shelter.address && (
        <p className="inline-flex items-center gap-1.5">
          <MapPinIcon />
          {shelter.address}
        </p>
      )}

      {distance && (
        <p className="inline-flex items-center gap-1.5 font-semibold text-blue-40">
          <MapPinIcon />
          {formatDistance(distance)}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-xs">
        <Tag tone="category">Category {shelter.category}</Tag>
        {shelter.access && <Tag tone="access">Accessible bathroom</Tag>}
        {shelter.water ? (
          <Tag tone="water">Potable water</Tag>
        ) : (
          <Tag tone="warning">No potable water</Tag>
        )}
      </div>

      <p>
        <Link href={mapsUrl(shelter)} rel="noopener noreferrer" target="_blank">
          Get directions on Google Maps
        </Link>
      </p>
    </li>
  )
}
