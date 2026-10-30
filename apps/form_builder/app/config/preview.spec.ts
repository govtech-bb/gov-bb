// LANDING_PREVIEW_URL is resolved once, when the module loads, so each case
// stubs the env and imports a fresh copy of the module.
const loadLandingPreviewUrl = async () =>
  (await import("./preview")).LANDING_PREVIEW_URL;

describe("LANDING_PREVIEW_URL", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the configured value, trimmed", async () => {
    vi.stubEnv(
      "VITE_LANDING_PREVIEW_URL",
      "  https://alpha.gov.bb/preview-start-page  ",
    );
    await expect(loadLandingPreviewUrl()).resolves.toBe(
      "https://alpha.gov.bb/preview-start-page",
    );
  });

  it("defaults to the local landing app when unset in a dev build", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_LANDING_PREVIEW_URL", "");
    await expect(loadLandingPreviewUrl()).resolves.toBe(
      "http://localhost:4000/preview-start-page",
    );
  });

  it("fails fast when unset in a production build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_LANDING_PREVIEW_URL", "");
    await expect(loadLandingPreviewUrl()).rejects.toThrow(
      /VITE_LANDING_PREVIEW_URL/,
    );
  });
});
