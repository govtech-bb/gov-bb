import type { ExecutionContext } from "@nestjs/common";
import { isValidSecretToken } from "@/common/secret-token";
import { THROTTLERS, type ThrottlerName } from "@/common/throttlers";

// Every chat user's lookup reaches the API from the chat's server, so per IP
// they would all share one client's limit (govtech-bb/govbb-chatbot#173). The
// chat proves it is the chat with X-Chat-Caller-Token, and gets a limit sized
// for all of its users together. Its own per-user limit lives in the chat.
//
// Higher, never unlimited: a leaked token still meets a ceiling. Per task, like
// every limit here (app.module.ts), so prod's 2 to 6 tasks allow 2-6x this.
// `short` is a sixth of `medium`, or it would quietly cap the chat below the
// rate `medium` allows (#2420, throttler-config.spec.ts).
export const CHAT_LIMITS: Record<ThrottlerName, number> = {
  short: 50,
  medium: 300,
  long: 3_000,
};

// One counter for the whole chat, whatever addresses its server sends from.
const CHAT_TRACKER = "chat";

interface HeaderedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * Whether the request carries the chat's caller token. Read from process.env
 * rather than ConfigService: this runs from a decorator, outside DI, and
 * ConfigModule writes the validated env back to process.env. An unset token
 * matches nothing (`isValidSecretToken` fails closed), and a repeated header
 * is not a token. Never log the header.
 */
export function isChatCaller(req: HeaderedRequest): boolean {
  const provided = req.headers["x-chat-caller-token"];

  return (
    typeof provided === "string" &&
    isValidSecretToken(process.env.CHAT_CALLER_TOKEN ?? "", provided)
  );
}

function requestOf(context: ExecutionContext): HeaderedRequest {
  return context.switchToHttp().getRequest<HeaderedRequest>();
}

/**
 * The status lookup's throttle (#3623): for each global bucket, the chat's
 * limit and counter for the chat, and the global per-IP ones for anyone else.
 * On this route only, so the token raises no limit anywhere else. The window
 * (`ttl`) stays the global one. Both read the request through the context, so
 * there is one way in. `String(ip)` matches the library's own tracker, so a
 * direct caller keeps the counter it has today.
 */
export const STATUS_LOOKUP_THROTTLE = Object.fromEntries(
  THROTTLERS.map(({ name, limit }) => [
    name,
    {
      limit: (context: ExecutionContext) =>
        isChatCaller(requestOf(context)) ? CHAT_LIMITS[name] : limit,
      getTracker: (_req: unknown, context: ExecutionContext) => {
        const req = requestOf(context);

        return isChatCaller(req) ? CHAT_TRACKER : String(req.ip);
      },
    },
  ]),
);
