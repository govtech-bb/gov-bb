declare global {
  interface Window {
    umami?: {
      track: (name?: string, data?: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(name: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!window.umami) return;
  if (data === undefined) {
    window.umami.track(name);
  } else {
    window.umami.track(name, data);
  }
}

export function trackPageview(): void {
  if (typeof window === "undefined") return;
  window.umami?.track();
}

export function deriveStartEventName(href: string): string {
  const trimmed = href.replace(/^\/+|\/+$/g, "");
  const withoutStart = trimmed.replace(/\/start$/, "");
  const slug = withoutStart.replace(/\//g, "-");
  return `${slug}-start`;
}
