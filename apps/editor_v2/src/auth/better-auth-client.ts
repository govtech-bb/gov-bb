import { createAuthClient } from "better-auth/client";
import {
  AuthFailure,
  authCallback,
  parseEmployeeSession,
  type AuthResult,
  type EditorAuth,
} from "./session";

/** Wrap Better Auth at the browser boundary; the API owns employee admission. */
export function createEditorAuth(apiOrigin: string, now: () => number): EditorAuth {
  const client = createAuthClient({
    baseURL: apiOrigin,
    // The route owns navigation after validating the returned provider URL.
    disableDefaultFetchPlugins: true,
    fetchOptions: { credentials: "include", cache: "no-store", timeout: 15_000, retry: 0 },
  });

  const unavailable = <T>(): AuthResult<T> => ({
    ok: false,
    error: new AuthFailure("unavailable"),
  });

  return {
    async session() {
      const result = await client
        .getSession({ query: { disableCookieCache: true } })
        .catch(() => null);

      if (!result || result.error) return unavailable();

      return parseEmployeeSession(result.data, now());
    },
    async signIn(editorOrigin, returnTo) {
      const result = await client.signIn
        .social({
          provider: "github",
          callbackURL: authCallback(editorOrigin, "complete", returnTo),
          errorCallbackURL: authCallback(editorOrigin, "error", returnTo),
          disableRedirect: true,
        })
        .catch(() => null);

      if (!result || result.error || !result.data.url) return unavailable();

      if (!URL.canParse(result.data.url)) return { ok: false, error: new AuthFailure("provider") };
      // The API chooses the provider; reject a malformed response before browser navigation.
      const url = new URL(result.data.url);

      if (
        url.protocol !== "https:" ||
        url.origin !== "https://github.com" ||
        url.pathname !== "/login/oauth/authorize" ||
        url.username ||
        url.password
      ) {
        return { ok: false, error: new AuthFailure("provider") };
      }

      return { ok: true, value: url.href };
    },
    async signOut() {
      const result = await client.signOut().catch(() => null);

      return !result || result.error ? unavailable() : { ok: true, value: undefined };
    },
  };
}
