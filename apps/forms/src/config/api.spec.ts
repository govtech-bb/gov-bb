// API_URL is resolved once, when the module loads, so each case stubs the
// env and imports a fresh copy of the module.
const loadApiUrl = async () => (await import("./api")).API_URL;

describe("API_URL", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the configured value, trimmed", async () => {
    vi.stubEnv("VITE_API_URL", "  https://forms.api.alpha.gov.bb  ");
    await expect(loadApiUrl()).resolves.toBe("https://forms.api.alpha.gov.bb");
  });

  it("defaults to the local API when unset in a dev build", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_API_URL", "");
    await expect(loadApiUrl()).resolves.toBe("http://localhost:3001");
  });

  it("fails fast when unset in a production build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_API_URL", "");
    await expect(loadApiUrl()).rejects.toThrow(/VITE_API_URL/);
  });
});
