import { Link, useLocation } from '@tanstack/react-router'
import { linkVariants } from '@govtech-bb/react'
import { getCategoryTitle, getPageTitle } from '../content/registry'

function titleCase(slug: string): string {
  const raw = slug.replace(/-/g, ' ')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function titleForSegment(seg: string): string {
  return getCategoryTitle(seg) ?? getPageTitle(seg) ?? titleCase(seg)
}

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  if (segments.includes('form')) return null

  const crumbs = segments.slice(0, -1)

  return (
    <nav aria-label="Breadcrumb" className="flex items-center">
      <ol className="flex flex-wrap items-center gap-y-1 [&>li:not(:first-child):not(:last-child)]:hidden [&>li:not(:first-child):not(:last-child)]:md:flex">
        <li className="flex items-center">
          <Link to="/" className={linkVariants()}>
            Home
          </Link>
        </li>
        {crumbs.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join('/')}`
          const title = titleForSegment(segment)
          return (
            <li
              key={href}
              className="flex items-center before:mx-[0.5em] before:inline-block before:h-[0.4375em] before:w-[0.4375em] before:shrink-0 before:rotate-45 before:border-mid-grey-00 before:border-t before:border-r before:content-['']"
            >
              <a href={href} className={`${linkVariants()} break-anywhere`}>
                {title}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
