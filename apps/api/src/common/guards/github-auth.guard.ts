import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { authorizeGitHubToken, extractBearerToken } from "../github-identity";

/**
 * Authenticates admin endpoints by a **forwarded GitHub access token** rather
 * than a shared static token. Reads `Authorization: Bearer <github token>`,
 * validates it against GitHub, and (in production) checks org/team membership —
 * local dev authorizes any valid GitHub user. The verified login is attached to
 * the request as `githubLogin` (read via the `@GitHubLogin()` decorator) so the
 * handler records an unspoofable audit author.
 *
 * Applied as a plain class (`@UseGuards(GitHubAuthGuard)`): it has no injected
 * constructor dependencies, so Nest can instantiate it without the DI-paramtype
 * pitfall that the variadic AdminTokenGuard has.
 */
@Injectable()
export class GitHubAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { githubLogin?: string }>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Missing GitHub token");
    }
    const login = await authorizeGitHubToken(token);
    if (!login) {
      throw new ForbiddenException("Not authorized for this action");
    }
    req.githubLogin = login;
    return true;
  }
}
