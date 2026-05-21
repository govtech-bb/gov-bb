import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

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

export const sendFeedback = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => raw as Record<string, unknown>)
  .handler(async ({ data }): Promise<FeedbackState> => {
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

    // SES integration deferred — log the submission for now.
    console.log('[feedback]', parsed.data)

    return { error: null, success: true }
  })
