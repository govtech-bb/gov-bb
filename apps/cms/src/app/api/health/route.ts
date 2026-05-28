import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import config from '@payload-config'

/**
 * Liveness + readiness probe for the load balancer.
 *
 * `?deep=1` runs a real DB round-trip via Payload (counts the categories
 * collection). Without it, returns 200 as soon as the Next.js server is up.
 * App Runner / ECS health checks can hit this without `?deep=1` for a cheap
 * pulse; pair with a separate deeper check if you want DB monitoring.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const deep = url.searchParams.has('deep')

  if (!deep) {
    return NextResponse.json({ status: 'ok' })
  }

  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'categories' })
    return NextResponse.json({ status: 'ok', database: 'reachable' })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        error: err instanceof Error ? err.message : 'unknown',
      },
      { status: 503 },
    )
  }
}
