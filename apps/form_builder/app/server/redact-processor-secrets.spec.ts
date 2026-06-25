/**
 * @vitest-environment node
 */
import {
  REDACTED_SECRET,
  redactRecipeSecrets,
  restoreRecipeSecrets,
  hasRedactedSecret,
  assertNoRedactedSecrets,
} from "./redact-processor-secrets";

// A recipe shaped like ServiceContractRecipe, with the processor secrets #294
// cares about. Only the fields under test matter here.
function recipeWithSecrets() {
  return {
    formId: "apply-for-thing",
    version: "1.0.0",
    processors: [
      { type: "email", config: { recipientField: "step.email" } },
      {
        type: "webhook",
        config: {
          url: "https://hooks.gov.bb/x",
          secret: "super-secret-hmac-key-1234",
          auth: { scheme: "hmac", secret: "auth-secret-key-abcdefgh" },
        },
      },
      { type: "opencrvs", config: { token: "opencrvs-token-xyz" } },
    ],
  };
}

describe("redactRecipeSecrets", () => {
  it("replaces webhook secret, webhook auth.secret, and opencrvs token", () => {
    const out = redactRecipeSecrets(recipeWithSecrets());
    expect(out.processors[1].config.secret).toBe(REDACTED_SECRET);
    expect(out.processors[1].config.auth.secret).toBe(REDACTED_SECRET);
    expect(out.processors[2].config.token).toBe(REDACTED_SECRET);
  });

  it("leaves non-secret fields and other processors untouched", () => {
    const out = redactRecipeSecrets(recipeWithSecrets());
    expect(out.processors[1].config.url).toBe("https://hooks.gov.bb/x");
    expect(out.processors[0].config.recipientField).toBe("step.email");
  });

  it("does not mutate the input recipe", () => {
    const input = recipeWithSecrets();
    redactRecipeSecrets(input);
    expect(input.processors[1].config.secret).toBe(
      "super-secret-hmac-key-1234",
    );
  });

  it("is a no-op when there are no processors", () => {
    expect(hasRedactedSecret(redactRecipeSecrets({ formId: "x" }))).toBe(false);
  });
});

describe("restoreRecipeSecrets", () => {
  it("restores the real secrets from the stored recipe over the placeholders", () => {
    const stored = recipeWithSecrets();
    const redacted = redactRecipeSecrets(stored);

    const restored = restoreRecipeSecrets(redacted, stored);

    expect(restored.processors[1].config.secret).toBe(
      "super-secret-hmac-key-1234",
    );
    expect(restored.processors[1].config.auth.secret).toBe(
      "auth-secret-key-abcdefgh",
    );
    expect(restored.processors[2].config.token).toBe("opencrvs-token-xyz");
    expect(hasRedactedSecret(restored)).toBe(false);
  });

  it("a load → save round-trip preserves the stored secret unchanged", () => {
    const stored = recipeWithSecrets();
    // Browser receives redacted, edits a non-secret field, sends it back.
    const fromBrowser = redactRecipeSecrets(stored);
    fromBrowser.processors[1].config.url = "https://hooks.gov.bb/new";

    const toApi = restoreRecipeSecrets(fromBrowser, stored);

    expect(toApi.processors[1].config.url).toBe("https://hooks.gov.bb/new");
    expect(toApi.processors[1].config.secret).toBe(
      "super-secret-hmac-key-1234",
    );
  });

  it("leaves a genuinely new secret (not the placeholder) as the caller set it", () => {
    const stored = { formId: "x", processors: [] };
    const incoming = {
      formId: "x",
      processors: [
        {
          type: "webhook",
          config: { url: "https://h", secret: "a-brand-new-key-0123456789" },
        },
      ],
    };
    const out = restoreRecipeSecrets(incoming, stored);
    expect(out.processors[0].config.secret).toBe("a-brand-new-key-0123456789");
  });
});

describe("assertNoRedactedSecrets", () => {
  it("throws when a placeholder could not be restored (no stored counterpart)", () => {
    const incoming = redactRecipeSecrets(recipeWithSecrets());
    const restored = restoreRecipeSecrets(incoming, { formId: "x" });
    expect(() => assertNoRedactedSecrets(restored)).toThrow(
      /could not be restored/,
    );
  });

  it("passes for a recipe with real secrets", () => {
    expect(() => assertNoRedactedSecrets(recipeWithSecrets())).not.toThrow();
  });
});
