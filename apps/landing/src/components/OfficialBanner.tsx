import { Text } from '@govtech-bb/react'

export function OfficialBanner() {
  return (
    <div className="bg-blue-100 text-white-00">
      <div className="container">
        <div className="flex items-center gap-2 py-2">
          <img
            alt=""
            aria-hidden="true"
            src="/images/coat-of-arms.png"
            width={17}
            height={16}
            className="block"
          />
          <Text as="span" className="text-white-00" size="caption">
            Official government website
          </Text>
        </div>
      </div>
    </div>
  )
}
