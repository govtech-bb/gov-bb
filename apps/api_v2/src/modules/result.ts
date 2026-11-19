/** An expected outcome; programming defects still throw. */
export type Result<T, E extends Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Carry a successful value across an application boundary. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Carry an expected failure without rejecting a promise. */
export const err = <E extends Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
