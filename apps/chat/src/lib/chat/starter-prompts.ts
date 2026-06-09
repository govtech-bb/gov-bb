/**
 * Starter-card prompts shown in the chat's empty state.
 *
 * Each `slug` must match a service in @govtech-bb/content. Enforced by
 * apps/chat/scripts/check-starter-prompts.ts (runs in the npm prebuild
 * lifecycle — CI's `nx build chat` fails on drift).
 */
export interface StarterPrompt {
  readonly slug: string;
  readonly prompt: string;
}

export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  { slug: "register-a-birth", prompt: "How do I register a birth?" },
  {
    slug: "get-birth-certificate",
    prompt: "How do I get a birth certificate?",
  },
  {
    slug: "apply-financial-assistance",
    prompt: "Apply for financial assistance",
  },
  {
    slug: "apply-for-a-school-uniform-grant",
    prompt: "School uniform grant for my child",
  },
];
