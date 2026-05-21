import { useSession } from "@tanstack/react-start/server";
import type { BuilderSessionData } from "./session-types";

export type { BuilderSessionData } from "./session-types";
export { isSessionValid } from "./session-types";

const SESSION_NAME = "form-builder-session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function getSessionPassword(): string {
  const pw = process.env.SESSION_SECRET;
  if (!pw || pw.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters",
    );
  }
  return pw;
}

export function getBuilderSession() {
  return useSession<BuilderSessionData>({
    name: SESSION_NAME,
    password: getSessionPassword(),
    maxAge: SESSION_TTL_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  });
}
