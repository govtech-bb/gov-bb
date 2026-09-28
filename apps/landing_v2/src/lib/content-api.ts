import { createServerFn } from '@tanstack/react-start'
import type { PageResponse } from '@govtech-bb/landing-v2-contract'
import indexPageFixture from '../fixtures/get-birth-certificate.json'

// The JSON's inferred types don't satisfy the contract's hast literal unions
// (e.g. `type: string`); assert once here.
const fixture = indexPageFixture as PageResponse

// Session 3 replaces this with the real fetch.
export const getPage = createServerFn({ method: 'GET' })
  .validator((url: string) => url)
  .handler(async (): Promise<PageResponse> => fixture)
