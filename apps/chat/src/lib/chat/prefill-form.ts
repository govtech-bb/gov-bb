// V1 stub: chat ships without the form-prefill handoff. The client-side
// tool handler calls this and catches; the assistant surfaces a clean
// "form integration pending" error to the user.
export function prefillFormSession(
  _service: string,
  _fields: Record<string, string>,
): Promise<string> {
  return Promise.reject(new Error("form prefill not yet wired"));
}
