/** Fetch JSON with one deadline covering both headers and body consumption. */
export async function fetchJsonWithTimeout(
  url: string,
  ms: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}
