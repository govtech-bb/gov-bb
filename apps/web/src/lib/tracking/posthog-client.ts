import posthog from "posthog-js";
import { useEffect, type ReactNode } from "react";

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const key = process.env.VITE_POSTHOG_KEY;
  const host = process.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const env =
    process.env.VITE_POSTHOG_ENV ?? process.env.NODE_ENV ?? "development";

  if (!key) return;

  posthog.init(key, {
    api_host: host,
    // We send our own structural events only.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    // Defence-in-depth: even if someone enables replay later, inputs stay masked.
    disable_session_recording: true,
    mask_all_text: true,
    persistence: "localStorage",
    loaded: (ph) => {
      ph.register({ env });
    },
  });

  initialized = true;
}

export function isPostHogEnabled() {
  return initialized;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return children;
}
