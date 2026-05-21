export interface BuilderSessionData {
  githubLogin: string;
  accessToken: string;
  teamMemberships: string[];
  expiresAt: number;
  oauthState?: string;
}

export function isSessionValid(
  data: Partial<BuilderSessionData> | undefined,
): boolean {
  if (!data) return false;
  return Boolean(
    data.githubLogin &&
    data.accessToken &&
    data.expiresAt &&
    data.expiresAt > Date.now(),
  );
}
