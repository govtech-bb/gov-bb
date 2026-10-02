import { requireEnv } from '@/config/env'

export const CHAT_URL = requireEnv(
  import.meta.env.VITE_CHAT_URL,
  'VITE_CHAT_URL',
  'https://chat.sandbox.alpha.gov.bb',
)
