import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/tell-us')({
  head: () => ({
    meta: [
      { title: 'Tell us what matters | Government of Barbados' },
      {
        name: 'description',
        content:
          'Help us improve government services in Barbados by sharing what matters to you.',
      },
    ],
    scripts: [{ src: 'https://tally.so/widgets/embed.js', async: true }],
  }),
  component: TellUsPage,
})

function TellUsPage() {
  return (
    <div className="container pt-4 pb-8 lg:py-8">
      <iframe
        className="m-0 border-none"
        data-tally-src="https://tally.so/embed/Pd1ele?alignLeft=1&transparentBackground=1&dynamicHeight=1"
        loading="lazy"
        title="Help Us Improve Government Services in Barbados"
        width="100%"
      />
    </div>
  )
}
