/**
 * Shared org utilities that work on both client and server (no fs dependency).
 */
export const ORG_PATH_PREFIX = '/government/organisations/'
export const orgHref = (slug: string): string => `${ORG_PATH_PREFIX}${slug}`
