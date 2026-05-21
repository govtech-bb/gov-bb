export type SubmitResult =
  | { ok: true; referenceNumber: string }
  | { ok: false; errors: Array<{ field: string; message: string }> };

export async function submitFormSession(
  service: string,
  fields: Record<string, string>,
): Promise<SubmitResult> {
  const res = await fetch("/api/forms-submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ service, fields }),
  });
  return (await res.json()) as SubmitResult;
}
