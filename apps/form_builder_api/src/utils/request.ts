// Read the optional `userLogin` (the editor's GitHub login, stamped by the SSR
// session) off a request body, trimmed. Empty when absent.
export function readUserLogin(body: unknown): string {
  const raw = (body as { userLogin?: unknown } | null)?.userLogin;
  return typeof raw === "string" ? raw.trim() : "";
}
