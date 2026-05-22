// V1 stub: always null. With knownFormSlugsInSources returning [], this is
// never called. Restore the rich field summarizer when the shared forms
// package lands.
export async function summarizeFormFields(
  _slug: string,
): Promise<string | null> {
  return null;
}
