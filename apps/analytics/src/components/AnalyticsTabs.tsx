import { Link, useRouterState } from '@tanstack/react-router'

// Primary navigation for the analytics data views. "Forms" is active on both the
// forms list and any individual form-detail page.
const TABS: { label: string; to: string; isActive: (p: string) => boolean }[] = [
  { label: 'Home', to: '/', isActive: (p) => p === '/' },
  {
    label: 'Forms',
    to: '/analytics/forms',
    isActive: (p) => p.startsWith('/analytics/forms'),
  },
  {
    label: 'Pages',
    to: '/analytics/pages',
    isActive: (p) => p.startsWith('/analytics/pages'),
  },
  {
    label: 'Search',
    to: '/analytics/search',
    isActive: (p) => p.startsWith('/analytics/search'),
  },
  {
    label: 'Tools',
    to: '/analytics/tools',
    isActive: (p) => p.startsWith('/analytics/tools'),
  },
]

export function AnalyticsTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="bg-white-00 border-b border-grey-00">
      <div className="container flex items-stretch h-11">
        <nav className="flex items-stretch gap-xm text-caption" aria-label="Primary">
          {TABS.map((tab) => {
            const active = tab.isActive(pathname)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100 ${
                  active
                    ? 'text-blue-00 font-bold'
                    : 'text-mid-grey-00 hover:text-blue-00'
                }`}
              >
                {tab.label}
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-px h-[2px] bg-blue-100"
                  />
                ) : null}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
