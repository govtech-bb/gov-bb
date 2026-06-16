// Link tokenisation (GOV.UK Chat's LinkTokenMapper pattern). URLs inside
// retrieved chunk text are replaced with opaque tokens (link_1, link_2, …)
// before the model ever sees them, with the token→URL map kept app-side. The
// model can only ever emit tokens we minted this turn — a fabricated or mangled
// URL is structurally impossible, not just forbidden by the prompt. The client
// swaps tokens back at render time (whole-text, every render — no stream-chunk
// boundary problem) and strips tokens that map to nothing.

export type LinkTokenMap = Record<string, string>;

// [label](target) — markdown links in chunk text. Targets are absolute
// (https://…) or site-relative (/travel-id-citizenship/…). mailto:/tel: and
// intra-page #anchors are left alone.
const MD_LINK_RE = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;

const TOKEN_PREFIX = "link_";
const TOKEN_RE = /\blink_(\d+)\b/g;
// A markdown link whose target is a token: restored to a real link, or
// collapsed to its label when the token is unknown (hallucinated).
const MD_TOKEN_LINK_RE = /\[([^\]\n]*)\]\((link_\d+)\)/g;

function isTokenizable(target: string): boolean {
  if (target.startsWith("http://") || target.startsWith("https://"))
    return true;
  return target.startsWith("/"); // site-relative; bare anchors/protocol links stay
}

export interface TokenizeState {
  map: LinkTokenMap;
  byUrl: Map<string, string>;
}

export function newTokenizeState(): TokenizeState {
  return { map: {}, byUrl: new Map() };
}

// Replace every markdown link target in `text` with a token, resolving relative
// targets against the landing origin so the restored link works from the chat's
// own origin. The same URL gets the same token across the whole context block.
export function tokenizeLinks(
  text: string,
  state: TokenizeState,
  landingOrigin: string,
): string {
  return text.replace(MD_LINK_RE, (whole, label: string, target: string) => {
    if (!isTokenizable(target)) return whole;
    const absolute = target.startsWith("/")
      ? `${landingOrigin}${target}`
      : target;
    let token = state.byUrl.get(absolute);
    if (!token) {
      token = `${TOKEN_PREFIX}${state.byUrl.size + 1}`;
      state.byUrl.set(absolute, token);
      state.map[token] = absolute;
    }
    return `[${label}](${token})`;
  });
}

// Render-side restoration. Known tokens become real links; unknown tokens (the
// model invented one) are removed — a hallucinated link must never render. Runs
// on the full accumulated text each render, so a token split across stream
// chunks simply restores one render later.
export function restoreLinks(text: string, map: LinkTokenMap): string {
  if (!text) return text;
  // Markdown-shaped first, so the bare-token pass can't eat the target out from
  // under its label.
  let out = text.replace(
    MD_TOKEN_LINK_RE,
    (_whole, label: string, token: string) => {
      const url = map[token];
      return url ? `[${label}](${url})` : label;
    },
  );
  out = out.replace(TOKEN_RE, (whole) => map[whole] ?? "");
  return out;
}
