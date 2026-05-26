// Source of truth for feature-flag state. Toggling a flag requires a commit
// and deploy — there is no runtime override.
export type FlagValue = '404' | 'unavailable' | 'internal'

export const FEATURE_FLAGS: Record<string, FlagValue> = {
  'bank-holiday-calendar': 'unavailable',
  //'money-financial-support/ezpay': '404',
}
