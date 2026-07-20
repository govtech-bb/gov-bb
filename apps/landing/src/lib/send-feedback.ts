import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { formsApiBase } from './forms-api-url'

const GENERIC_ERROR =
  'Sorry, we could not send your feedback. Please try again.'

const FeedbackSchema = z
  .object({
    visitReason: z.string(),
    whatWentWrong: z.string(),
    referrer: z.string().optional().default(''),
  })
  .refine((d) => d.visitReason.trim() || d.whatWentWrong.trim(), {
    message: 'At least one feedback field is required',
    path: ['visitReason'],
  })

export type FeedbackState = {
  error: string | null
  fieldErrors?: Record<string, string>
  success?: boolean
}

/**
 * Validate the feedback and forward it to the forms API, which emails it to the
 * feedback inbox (#1298). Pure and decoupled from the server runtime so it can
 * be tested with a mocked fetch — the `createServerFn` handler below supplies
 * the real `apiBase` and `fetch`.
 *
 * A network error or non-2xx response returns a real error state (never a false
 * success), so the form shows the visitor it didn't go through.
 */
export async function postFeedback(
  data: Record<string, unknown>,
  opts: { apiBase: string; fetchImpl?: typeof fetch },
): Promise<FeedbackState> {
  const parsed = FeedbackSchema.safeParse(data)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !(key in fieldErrors)) {
        fieldErrors[key] = issue.message
      }
    }
    return { error: null, fieldErrors }
  }

  const apiBase = opts.apiBase.replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const response = await doFetch(`${apiBase}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })
    if (!response.ok) {
      return { error: GENERIC_ERROR }
    }
    return { error: null, success: true }
  } catch {
    return { error: GENERIC_ERROR }
  }
}

export const sendFeedback = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw as Record<string, unknown>)
  .handler(async ({ data }): Promise<FeedbackState> => {
    return postFeedback(data, { apiBase: formsApiBase() })
  })
