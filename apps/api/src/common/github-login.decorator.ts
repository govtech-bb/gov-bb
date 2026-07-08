import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Injects the GitHub login verified by {@link GitHubAuthGuard} (attached to the
 * request as `githubLogin`). Only meaningful on routes guarded by
 * GitHubAuthGuard; returns an empty string otherwise.
 */
export const GitHubLogin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ githubLogin?: string }>();
    return req.githubLogin ?? "";
  },
);
