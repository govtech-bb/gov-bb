'use client'

import Script from 'next/script'

export function TallyEmbed() {
  return (
    <>
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />
      <iframe
        className="m-0 border-none"
        data-tally-src="https://tally.so/embed/Pd1ele?alignLeft=1&transparentBackground=1&dynamicHeight=1"
        loading="lazy"
        title="Help Us Improve Government Services in Barbados"
        width="100%"
      />
    </>
  )
}
