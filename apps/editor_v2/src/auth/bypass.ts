import type { EditorAuth } from "./session";

/**
 * Local development only (`VITE_AUTH_BYPASS=true` under `vite dev`): always signed in, no GitHub.
 * Pair it with api_v2's `AUTH_BYPASS`, or API reads are refused.
 */
export const bypassAuth: EditorAuth = {
  session: async () => ({
    ok: true,
    value: { email: "developer@localhost", expiresAt: Date.now() + 8 * 60 * 60 * 1000 },
  }),
  signIn: async (_editorOrigin, returnTo) => ({ ok: true, value: returnTo }),
  signOut: async () => ({ ok: true, value: undefined }),
};
