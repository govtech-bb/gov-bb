export interface ResolutionContext {
  values: Record<string, unknown>;
  meta?: Record<string, unknown>;
  submission?: { id: string; formId: string; idempotencyKey: string };
}
