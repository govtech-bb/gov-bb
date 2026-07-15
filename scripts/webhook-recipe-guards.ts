import { webhookUrlToken, webhookSecretToken } from "@govtech-bb/form-types";

/**
 * Lint the per-form webhook destination convention (#1920) on a parsed recipe:
 *  - `endpoint.env` follows `WEBHOOK_URL_<TOKEN>`;
 *  - an apiKey `auth.secretEnv` follows `WEBHOOK_SECRET_<TOKEN>`;
 *  - the URL token and secret token MATCH — structurally blocking a recipe from
 *    pairing one destination's URL with another destination's secret.
 * Returns human-readable error strings (empty when clean).
 */
interface WebhookProcessorish {
  type?: string;
  config?: {
    endpoint?: { env?: string };
    auth?: { scheme?: string; secretEnv?: string };
  };
}

export function checkWebhookDestinations(
  recipe: unknown,
  relative: string,
): string[] {
  const errors: string[] = [];
  const processors = (recipe as { processors?: unknown }).processors;
  if (!Array.isArray(processors)) return errors;

  processors.forEach((raw, i) => {
    const p = raw as WebhookProcessorish;
    if (p?.type !== "webhook") return;
    const cfg = p.config ?? {};

    const urlEnv = cfg.endpoint?.env;
    const secretEnv =
      cfg.auth?.scheme === "apiKey" ? cfg.auth?.secretEnv : undefined;

    let urlToken: string | null = null;
    if (urlEnv) {
      urlToken = webhookUrlToken(urlEnv);
      if (!urlToken) {
        errors.push(
          `${relative}: processors[${i}] endpoint.env "${urlEnv}" must follow WEBHOOK_URL_<TOKEN> (uppercase token)`,
        );
      }
    }

    let secretToken: string | null = null;
    if (secretEnv) {
      secretToken = webhookSecretToken(secretEnv);
      if (!secretToken) {
        errors.push(
          `${relative}: processors[${i}] auth.secretEnv "${secretEnv}" must follow WEBHOOK_SECRET_<TOKEN> (uppercase token)`,
        );
      }
    }

    if (urlToken && secretToken && urlToken !== secretToken) {
      errors.push(
        `${relative}: processors[${i}] URL token "${urlToken}" and secret token "${secretToken}" must match (per-form destination — prevents cross-wired secrets)`,
      );
    }
  });

  return errors;
}
