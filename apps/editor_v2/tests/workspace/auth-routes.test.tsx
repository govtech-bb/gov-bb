/** @vitest-environment jsdom */
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthFailure, type EditorAuth } from "../../src/auth/session";
import { getRouter } from "../../src/router";
import { routeTree } from "../../src/routeTree.gen";
import { renderInPage } from "../helpers/page-editor";
import { shownText } from "../helpers/shown-text";

const routers: ReturnType<typeof getRouter>[] = [];

const employee = { email: "officer@govtech.bb", expiresAt: Date.now() + 3_600_000 };

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: true,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(url.endsWith("/version") ? { count: 0, latest: null } : []),
    ),
  );
  Object.assign(routeTree.options, {
    shellComponent: ({ children }: { children: ReactNode }) => <>{children}</>,
  });
});

afterEach(() => {
  for (const router of routers.splice(0)) {
    router.options.context!.queryClient.clear();
    router.history.destroy();
  }
});

async function mountAuth(
  path: string,
  session: EditorAuth["session"] = async () => ({ ok: true, value: null }),
) {
  const auth: EditorAuth = {
    session: vi.fn(session),
    signIn: vi.fn<EditorAuth["signIn"]>(async () => ({
      ok: false,
      error: new AuthFailure("unavailable"),
    })),
    signOut: vi.fn<EditorAuth["signOut"]>(async () => ({ ok: true, value: undefined })),
  };

  const router = getRouter();
  router.options.context!.queryClient.setDefaultOptions({ queries: { retry: false } });
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { ...router.options.context!, auth },
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    scrollRestoration: false,
  });
  routers.push(router);
  await renderInPage(<RouterProvider router={router} />);

  return { auth, router };
}

const until = (assertion: () => void) =>
  act(async () => {
    await vi.waitFor(assertion);
  });

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((item) => shownText(item) === label)!;

test("direct auth is a sign-in screen and never starts GitHub on mount or preload", async () => {
  const { auth, router } = await mountAuth("/auth");
  await until(() =>
    expect(document.querySelector("h1")?.textContent).toBe("Sign in to GovBB editor"),
  );
  expect(button("Continue with GitHub")).toBeDefined();
  await act(async () => {
    await router.preloadRoute({
      to: "/auth",
      search: { state: "sign-in", returnTo: "/services", reason: "provider" },
    });
  });
  expect(auth.signIn).not.toHaveBeenCalled();
});

test("a held admission names the session check, then waits for an explicit sign-in action", async () => {
  const held = Promise.withResolvers<Awaited<ReturnType<EditorAuth["session"]>>>();

  const { auth, router } = await mountAuth(
    "/services/team/page?view=source#content",
    () => held.promise,
  );

  await until(() => expect(document.body.textContent).toContain("Checking your session…"));
  expect(document.querySelector("header")).toBeNull();
  expect(auth.signIn).not.toHaveBeenCalled();
  await act(async () => held.resolve({ ok: true, value: null }));
  await until(() => expect(button("Continue with GitHub")).toBeDefined());
  expect(router.state.location.search).toMatchObject({
    returnTo: "/services/team/page?view=source#content",
  });
  expect(auth.signIn).not.toHaveBeenCalled();
});

test("a GitHub action stays local, rejects duplicate activation, and recovers from failure", async () => {
  const { auth } = await mountAuth("/auth?state=sign-in&returnTo=%2Fcategories");
  await until(() => expect(button("Continue with GitHub")).toBeDefined());
  const held = Promise.withResolvers<Awaited<ReturnType<EditorAuth["signIn"]>>>();
  vi.mocked(auth.signIn).mockReturnValueOnce(held.promise);
  await act(async () => {
    button("Continue with GitHub").click();
  });
  expect(button("Opening GitHub…")?.getAttribute("aria-disabled")).toBe("true");
  await act(async () => {
    button("Opening GitHub…").click();
  });
  expect(auth.signIn).toHaveBeenCalledOnce();
  expect(auth.signIn).toHaveBeenCalledWith(window.location.origin, "/categories");
  await act(async () => held.resolve({ ok: false, error: new AuthFailure("unavailable") }));
  expect(document.body.textContent).toContain("We could not reach the sign-in service");
  expect(button("Continue with GitHub")).toBeDefined();
});

test("retrying an unavailable admission checks the session instead of starting OAuth", async () => {
  const { auth, router } = await mountAuth("/services", async () => ({
    ok: false,
    error: new AuthFailure("unavailable"),
  }));

  await until(() => expect(button("Try again")).toBeDefined());
  vi.mocked(auth.session).mockResolvedValue({ ok: true, value: employee });
  await act(async () => {
    button("Try again").click();
  });
  await until(() => expect(router.state.location.pathname).toBe("/services"));
  expect(auth.signIn).not.toHaveBeenCalled();
  await until(() => expect(document.querySelector("header")?.textContent).toContain("Sign out"));
});

test("a callback names its work and a missing cookie stops without restarting OAuth", async () => {
  const held = Promise.withResolvers<Awaited<ReturnType<EditorAuth["session"]>>>();
  const { auth } = await mountAuth("/auth?state=complete&returnTo=%2Fservices", () => held.promise);
  await until(() => expect(document.body.textContent).toContain("Completing sign-in…"));
  await act(async () => held.resolve({ ok: true, value: null }));
  await until(() =>
    expect(document.body.textContent).toContain("Your sign-in could not be confirmed"),
  );
  expect(button("Continue with GitHub")).toBeDefined();
  expect(auth.signIn).not.toHaveBeenCalled();
});

test("an unexpected route failure has app-owned recovery without exposing its details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const { auth } = await mountAuth("/services", async () => {
    throw new Error("Private upstream detail");
  });

  await until(() =>
    expect(document.querySelector("h1")?.textContent).toBe("Unable to open this screen"),
  );
  expect(document.body.textContent).not.toContain("Private upstream detail");
  expect(document.body.textContent).not.toContain("Something went wrong!");
  vi.mocked(auth.session).mockResolvedValue({ ok: true, value: employee });
  await act(async () => {
    button("Try again").click();
  });
  await until(() => expect(document.querySelector("header")?.textContent).toContain("Sign out"));
});

test("a valid session opens the workspace without rendering sign-in", async () => {
  const { auth } = await mountAuth("/services", async () => ({ ok: true, value: employee }));
  await until(() => expect(document.querySelector("header")?.textContent).toContain("Sign out"));
  expect(button("Continue with GitHub")).toBeUndefined();
  expect(auth.signIn).not.toHaveBeenCalled();
});
