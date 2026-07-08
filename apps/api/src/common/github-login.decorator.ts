import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Resolves the GitHub login verified by {@link GitHubAuthGuard} from the request
 * (attached as `githubLogin`), or an empty string when absent. Exported so it can
 * be unit-tested directly — NestJS does not expose a param decorator's factory.
 */
export const githubLoginFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): string => {
  const req = ctx.switchToHttp().getRequest<{ githubLogin?: string }>();
  return req.githubLogin ?? "";
};

/**
 * Injects the GitHub login verified by {@link GitHubAuthGuard} (attached to the
 * request as `githubLogin`). Only meaningful on routes guarded by
 * GitHubAuthGuard; returns an empty string otherwise.
 */
export const GitHubLogin = createParamDecorator(githubLoginFactory);
