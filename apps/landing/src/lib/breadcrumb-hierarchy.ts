const PHARMACY_SERVICE_PATH =
  'health-and-emergency-services/find-an-open-pharmacy'

const PARENT_PATHS: Readonly<Record<string, string>> = {
  'health-and-emergency-services/free-or-subsidised-medication':
    PHARMACY_SERVICE_PATH,
  'health-and-emergency-services/prescription-colours': PHARMACY_SERVICE_PATH,
}

export function breadcrumbPaths(pathname: string): string[] {
  const current = pathname.replace(/^\/+|\/+$/g, '')
  if (!current) return []

  const parent = PARENT_PATHS[current]
  const hierarchy = parent ?? current
  const segments = hierarchy.split('/')
  const paths = segments.map((_, index) =>
    segments.slice(0, index + 1).join('/'),
  )

  return parent ? [...paths, current] : paths
}
