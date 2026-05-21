import { getBuilderSession } from "./session";
import { isSessionValid, type BuilderSessionData } from "./session-types";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Server-function guard: require a valid GitHub session. Throws
 * UnauthorizedError if none or expired. Returns the session data so the caller
 * can use the github login / access token.
 */
export async function requireSession(): Promise<BuilderSessionData> {
  const session = await getBuilderSession();
  if (!isSessionValid(session.data)) {
    throw new UnauthorizedError();
  }
  return session.data as BuilderSessionData;
}

/**
 * Server-function guard: require a valid session AND membership in the
 * configured publish team. Used to gate the publishRecipe server function.
 */
export async function requirePublisher(): Promise<BuilderSessionData> {
  const data = await requireSession();
  const teamSlug = process.env.GITHUB_PUBLISH_TEAM_SLUG;
  if (!teamSlug) {
    throw new Error("GITHUB_PUBLISH_TEAM_SLUG must be set");
  }
  if (!data.teamMemberships.includes(teamSlug)) {
    throw new ForbiddenError(`Not a member of the ${teamSlug} team`);
  }
  return data;
}
