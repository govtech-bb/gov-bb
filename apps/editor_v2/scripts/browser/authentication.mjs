import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";
import { employeeSession, servicesFixture } from "./auth-fixture.mjs";
import { fixturePage, installPageApi } from "./page-api-fixture.mjs";

const browser = await chromium.launch();

const context = await browser.newContext({ reducedMotion: "reduce" });

const page = await context.newPage();

const base = new URL(process.argv[2] ?? "http://localhost:3000/");

let session = null;

let unavailable = false;

let callback;

let signIns = 0;

let signOuts = 0;

let sessionGate;

let signInGate;

const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

await page.exposeFunction("recordAuthError", (message) => errors.push(message));

await page.addInitScript(() => {
  new MutationObserver(() => {
    if (document.body?.textContent.includes("Something went wrong!"))
      void window.recordAuthError("TanStack error screen appeared");
  }).observe(document, { childList: true, subtree: true });
});

page.setDefaultTimeout(15_000);

await context.route("**/api/auth/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  const headers = {
    "access-control-allow-origin": base.origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };

  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

  if (unavailable)
    return route.fulfill({ status: 503, json: { error: "auth_unavailable" }, headers });

  if (path === "/api/auth/get-session") {
    await sessionGate;

    return route.fulfill({ json: session, headers });
  }

  if (path === "/api/auth/sign-in/social") {
    signIns++;
    const body = request.postDataJSON();
    assert.equal(body.provider, "github");
    assert.equal(body.disableRedirect, true);
    callback = body.callbackURL;
    assert.equal(new URL(callback).origin, base.origin);
    assert.equal(new URL(body.errorCallbackURL).searchParams.get("state"), "error");

    await signInGate;

    return route.fulfill({
      json: { url: "https://github.com/login/oauth/authorize?state=fixture", redirect: false },
      headers,
    });
  }

  if (path === "/api/auth/sign-out") {
    signOuts++;
    session = null;

    return route.fulfill({ json: { success: true }, headers });
  }

  throw new Error(`Unexpected auth endpoint: ${path}`);
});

await context.route("https://github.com/**", (route) =>
  route.fulfill({ contentType: "text/html", body: "<h1>GitHub sign-in fixture</h1>" }),
);

await installPageApi(context, { ...servicesFixture[0], id: "team", title: "Team" }, [
  fixturePage("page", {
    title: "Existing page",
    parent_id: "team",
    body_markdown: "Preserve this page.",
  }),
]);

try {
  const target = "/services/team/page?view=source#content";
  const admission = Promise.withResolvers();
  sessionGate = admission.promise;
  await page.goto(new URL(target, base).href);
  await page.getByText("Checking your session…", { exact: true }).waitFor();
  assert.equal(signIns, 0);
  assert.equal(
    await page.getByRole("status").filter({ hasText: "Checking your session…" }).count(),
    1,
  );
  assert.equal(
    await page
      .locator(".trident-loader-band")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).animationName === "none"),
      ),
    true,
    "reduced motion stops the trident",
  );
  assert.equal(await page.locator("header").count(), 0, "no workspace before admission");
  admission.resolve();
  sessionGate = undefined;
  const continueButton = page.getByRole("button", { name: "Continue with GitHub", exact: true });
  await continueButton.waitFor();
  assert.equal(signIns, 0, "anonymous entry waits for consent");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "sign-in reflows at 320px and 200% text",
  );
  assert.equal(
    await continueButton.evaluate((element) => {
      const label = element.querySelector("span").getBoundingClientRect();
      const bounds = element.getBoundingClientRect();

      return label.top >= bounds.top && label.bottom <= bounds.bottom;
    }),
    true,
    "wrapped button text must not be clipped",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const oauth = Promise.withResolvers();
  signInGate = oauth.promise;
  await continueButton.focus();

  const started = page.waitForRequest(
    (request) => request.url().includes("/api/auth/sign-in/social") && request.method() === "POST",
  );

  await page.keyboard.press("Enter");
  await started;
  const opening = page.getByRole("button", { name: "Opening GitHub…", exact: true });
  await opening.waitFor();
  assert.equal(await opening.getAttribute("aria-disabled"), "true");
  await page.keyboard.press("Enter");
  assert.equal(signIns, 1, "a second press does not start another OAuth request");
  oauth.resolve();
  signInGate = undefined;
  await page.waitForURL("https://github.com/**", { waitUntil: "commit" });
  assert.equal(signIns, 1, "only the explicit action starts GitHub");
  assert.equal(new URL(callback).searchParams.get("returnTo"), target);

  session = employeeSession();
  const completion = Promise.withResolvers();
  sessionGate = completion.promise;
  await page.goto(callback);
  await page.getByText("Completing sign-in…", { exact: true }).waitFor();
  completion.resolve();
  sessionGate = undefined;
  await page.waitForURL(new URL(target, base).href);
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  assert.equal(await title.inputValue(), "Existing page");

  await title.fill("Keep unsaved work");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const leave = page.getByRole("alertdialog");
  await leave.waitFor();
  assert.equal(signOuts, 0, "confirmation happens before revoking the session");
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  session = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await leave.waitFor();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(signIns, 1, "cancelled expiry does not start OAuth");
  assert.equal(await title.inputValue(), "Keep unsaved work");
  session = employeeSession();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await leave.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "You are signed out" }).waitFor();
  assert.equal(signOuts, 1);
  assert.equal(signIns, 1, "sign-out does not immediately restart OAuth");
  assert.equal(await leave.count(), 0, "no second navigation question");

  await page.goto(new URL("/auth?state=complete&returnTo=%2Fservices", base).href);
  await page.getByText(/Your sign-in could not be confirmed/).waitFor();
  assert.equal(signIns, 1, "missing callback cookie stops with recovery");
  await page.goto(new URL("/auth?state=error&error=access_denied", base).href);
  await page.getByRole("alert").filter({ hasText: "Sign-in was not completed" }).waitFor();
  assert.equal(signIns, 1, "provider denial does not loop");

  unavailable = true;
  await page.goto(new URL("/services", base).href);
  await page.getByText(/We could not reach the sign-in service/).waitFor();
  assert.equal(signIns, 1, "outage does not start OAuth");
  unavailable = false;
  await page.waitForFunction(() => document.activeElement?.tagName === "H1");
  await page.keyboard.press("Tab");
  const retryButton = page.getByRole("button", { name: "Try again", exact: true });
  assert.equal(await retryButton.evaluate((element) => element === document.activeElement), true);
  assert.notEqual(
    await retryButton.evaluate((element) => getComputedStyle(element).outlineStyle),
    "none",
  );
  await page.keyboard.press("Enter");
  await continueButton.waitFor();
  assert.equal(signIns, 1, "session recovery does not start OAuth");
  await continueButton.click();
  await page.waitForURL("https://github.com/**", { waitUntil: "commit" });
  assert.equal(signIns, 2, "recovery starts OAuth only when requested");

  session = employeeSession();
  const returnTarget = "/services?search=Existing#content";
  await page.goto(
    new URL(`/auth?state=complete&returnTo=${encodeURIComponent(returnTarget)}`, base).href,
  );
  await page.waitForURL(new URL(returnTarget, base).href);
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  assert.equal(signIns, 2, "callback preserves search and fragment without restarting OAuth");

  await page.goto(new URL("/auth", base).href);
  await continueButton.waitFor();
  assert.equal(signIns, 2, "direct auth never starts OAuth on mount");
  assert.deepEqual(errors, [], "no transient framework error screen or uncaught errors");
  console.log(
    "PASS explicit GitHub sign-in, delayed admission/callback, recovery, sign-out and blocked-draft preservation",
  );
} finally {
  await browser.close();
}
