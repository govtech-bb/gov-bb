import { assertDeployedLinkOrigins } from "./build-env";

// The env resolver vite.config.ts passes in (loadEnv + process.env), stubbed to
// whatever the branch has set.
const picker =
  (vars: Record<string, string>) =>
  (key: string): string =>
    vars[key] ?? "";

// Placeholder origins — the guard only cares whether a value is present, so
// these deliberately aren't any real environment's hostnames.
const bothSet = picker({
  LANDING_URL: "https://landing.example",
  FORMS_URL: "https://forms.example",
});
const noneSet = picker({});

describe("assertDeployedLinkOrigins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A deployed (Amplify) build: AWS_APP_ID is present only in that container.
  describe("on a deployed build", () => {
    beforeEach(() => {
      vi.stubEnv("AWS_APP_ID", "d170ysh10vddy3");
      vi.stubEnv("AWS_BRANCH", "sandbox");
    });

    it("throws naming both vars when neither is set", () => {
      expect(() => assertDeployedLinkOrigins("build", noneSet)).toThrow(
        /LANDING_URL and FORMS_URL must be set on the Amplify branch \(sandbox\)/,
      );
    });

    it("throws naming only the missing var", () => {
      const landingOnly = picker({ LANDING_URL: "https://landing.example" });
      expect(() => assertDeployedLinkOrigins("build", landingOnly)).toThrow(
        /^feature_flagging: FORMS_URL must be set/,
      );
    });

    it("passes when both are set", () => {
      expect(() => assertDeployedLinkOrigins("build", bothSet)).not.toThrow();
    });

    // `vite dev` inside the Amplify container isn't a thing, but the guard is
    // scoped to builds so the dev server can never be blocked by it.
    it("ignores a dev server", () => {
      expect(() => assertDeployedLinkOrigins("serve", noneSet)).not.toThrow();
    });
  });

  // A local or CI `vite build` has no AWS_APP_ID, and must keep the localhost
  // fallback in app/lib/service-url.ts — otherwise `nx run-many -t build`
  // and every developer's build would fail without these vars set.
  describe("outside a deployed build", () => {
    it("allows a build with neither var set", () => {
      vi.stubEnv("AWS_APP_ID", undefined);
      expect(() => assertDeployedLinkOrigins("build", noneSet)).not.toThrow();
    });
  });
});
