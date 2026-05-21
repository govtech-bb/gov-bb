// Form schema loaders intentionally empty in chat v1. Restore once the
// shared forms package lands and chat can validate/prefill against real
// schemas. With this empty, knownFormSlugsInSources returns [] and the
// API skips the openFormReview tool wiring.
export const CHAT_FORM_SCHEMA_LOADERS: Record<
  string,
  () => Promise<{ formSteps: never[] }>
> = {};
