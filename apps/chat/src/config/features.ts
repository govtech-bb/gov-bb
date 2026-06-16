import { getServerEnv, type ServerEnv } from "./env";

// In-chat form feature toggles, resolved from validated env. Default: ALL OFF →
// the assistant only answers questions. Each feature gates independently so the
// form features can ship dark and roll out one at a time; RAG_ONLY is a master
// kill-switch that forces every feature off regardless of the individual flags
// — a one-line rollback to question-answering only. Consumers (the chat
// endpoint, when it merges in the form tools) read this, not the raw env, so the
// override logic lives in exactly one place.
export interface Features {
  // INLINE form collection + approval-gated submit. NOT the handoff link —
  // pointing to a service's start page is baseline (gated per-service by the
  // policy map, not a flag); this flag is only for filling a form IN chat.
  forms: boolean;
  feedback: boolean; // feedback capture
  offers: boolean; // proactive "fill this form?" offers after an answer
}

export function getFeatures(env: ServerEnv = getServerEnv()): Features {
  if (env.RAG_ONLY) return { forms: false, feedback: false, offers: false };
  return {
    forms: env.FEATURE_FORMS,
    feedback: env.FEATURE_FEEDBACK,
    offers: env.FEATURE_OFFERS,
  };
}

// True when no form feature is active — the turn only answers questions.
export const isRagOnly = (f: Features): boolean =>
  !f.forms && !f.feedback && !f.offers;
