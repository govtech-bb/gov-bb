/** Keeps credentials out of ordinary string, object and JSON diagnostics. */
export class Redacted<T> {
  readonly #value: T;

  /** Wrap a credential as soon as it crosses the configuration or HTTP boundary. */
  constructor(value: T) {
    this.#value = value;
  }

  /** Reveal only to the adapter that needs the underlying credential. */
  reveal(): T {
    return this.#value;
  }

  /** Safe representation for interpolated diagnostics. */
  toString(): string {
    return "[REDACTED]";
  }

  /** Safe representation for structured logging. */
  toJSON(): string {
    return "[REDACTED]";
  }
}
