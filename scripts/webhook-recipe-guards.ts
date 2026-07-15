import { webhookUrlToken, webhookSecretToken } from "@govtech-bb/form-types";

/**
 * Lint the per-form webhook destination convention (#1920) on a parsed recipe:
 *  - `endpoint.env` follows `WEBHOOK_URL_<TOKEN>`;
 *  - an apiKey `auth.secretEnv` follows `WEBHOOK_SECRET_<TOKEN>`;
 *  - the URL token and secret token MATCH — structurally blocking a recipe from
 *    pairing one destination's URL with another destination's secret;
 *  - every `mapping.applicant` path is a well-formed `stepId.fieldId` whose
 *    `stepId` exists in the recipe, and every `excludeSteps` entry names a real
 *    step — catching the typo that would otherwise send a blank applicant.
 *
 * (Field-level existence within a step needs registry-ref expansion and is not
 * yet checked here — the runtime read simply yields null for a bad field.)
 * Returns human-readable error strings (empty when clean).
 */
interface WebhookProcessorish {
  type?: string;
  config?: {
    endpoint?: { env?: string };
    auth?: { scheme?: string; secretEnv?: string };
    mapping?: {
      applicant?: { name?: unknown; email?: unknown; phone?: unknown };
      excludeSteps?: unknown;
    };
  };
}

function stepIdsOf(recipe: unknown): Set<string> {
  const steps = (recipe as { steps?: unknown }).steps;
  const ids = new Set<string>();
  if (Array.isArray(steps)) {
    for (const s of steps) {
      const id = (s as { stepId?: unknown }).stepId;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

function checkApplicantPath(
  path: unknown,
  label: string,
  stepIds: Set<string>,
  loc: string,
): string[] {
  if (typeof path !== "string") return [];
  const dot = path.indexOf(".");
  if (dot <= 0 || dot === path.length - 1) {
    return [
      `${loc} applicant.${label} path "${path}" must be "stepId.fieldId"`,
    ];
  }
  const stepId = path.slice(0, dot);
  if (!stepIds.has(stepId)) {
    return [
      `${loc} applicant.${label} path "${path}" references unknown step "${stepId}"`,
    ];
  }
  return [];
}

export function checkWebhookDestinations(
  recipe: unknown,
  relative: string,
): string[] {
  const errors: string[] = [];
  const processors = (recipe as { processors?: unknown }).processors;
  if (!Array.isArray(processors)) return errors;
  const stepIds = stepIdsOf(recipe);

  processors.forEach((raw, i) => {
    const p = raw as WebhookProcessorish;
    if (p?.type !== "webhook") return;
    const cfg = p.config ?? {};
    const loc = `${relative}: processors[${i}]`;

    const urlEnv = cfg.endpoint?.env;
    const secretEnv =
      cfg.auth?.scheme === "apiKey" ? cfg.auth?.secretEnv : undefined;

    let urlToken: string | null = null;
    if (urlEnv) {
      urlToken = webhookUrlToken(urlEnv);
      if (!urlToken) {
        errors.push(
          `${loc} endpoint.env "${urlEnv}" must follow WEBHOOK_URL_<TOKEN> (uppercase token)`,
        );
      }
    }

    let secretToken: string | null = null;
    if (secretEnv) {
      secretToken = webhookSecretToken(secretEnv);
      if (!secretToken) {
        errors.push(
          `${loc} auth.secretEnv "${secretEnv}" must follow WEBHOOK_SECRET_<TOKEN> (uppercase token)`,
        );
      }
    }

    if (urlToken && secretToken && urlToken !== secretToken) {
      errors.push(
        `${loc} URL token "${urlToken}" and secret token "${secretToken}" must match (per-form destination — prevents cross-wired secrets)`,
      );
    }

    // Mapping path checks — only meaningful when the recipe has steps to
    // validate against (a summary/fixture with no steps is skipped).
    const mapping = cfg.mapping;
    if (mapping && stepIds.size > 0) {
      const names = Array.isArray(mapping.applicant?.name)
        ? mapping.applicant?.name
        : [mapping.applicant?.name];
      for (const n of names ?? []) {
        errors.push(...checkApplicantPath(n, "name", stepIds, loc));
      }
      errors.push(
        ...checkApplicantPath(mapping.applicant?.email, "email", stepIds, loc),
      );
      errors.push(
        ...checkApplicantPath(mapping.applicant?.phone, "phone", stepIds, loc),
      );
      if (Array.isArray(mapping.excludeSteps)) {
        for (const s of mapping.excludeSteps) {
          if (typeof s === "string" && !stepIds.has(s)) {
            errors.push(`${loc} excludeSteps entry "${s}" is not a step`);
          }
        }
      }
    }
  });

  return errors;
}
