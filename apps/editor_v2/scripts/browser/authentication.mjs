import assert from "node:assert/strict";
import { chromium } from "./playwright.mjs";
import { employeeSession } from "./auth-fixture.mjs";

const browser = await chromium.launch();

const context = await browser.newContext();

const page = await context.newPage();

const base = new URL(process.argv[2] ?? "http://localhost:3000/");

let session = null;

let unavailable = false;

let callback;

let signIns = 0;

let signOuts = 0;

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

  if (path === "/api/auth/get-session") return route.fulfill({ json: session, headers });

  if (path === "/api/auth/sign-in/social") {
    signIns++;
    const body = request.postDataJSON();
    assert.equal(body.provider, "github");
    assert.equal(body.disableRedirect, true);
    callback = body.callbackURL;
    assert.equal(new URL(callback).origin, base.origin);
    assert.equal(new URL(body.errorCallbackURL).searchParams.get("state"), "error");

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

await context.addInitScript(() => {
  if (localStorage.getItem("govbb-editor:workspace:v1")) return;

  const keys = {
    committed: "govbb-editor:documents:page:markdown",
    working: "govbb-editor:documents:page:working",
    previous: "govbb-editor:documents:page:previous",
    legacy: "govbb-editor:documents:page:legacy",
  };

  localStorage.setItem(keys.committed, "---\ntitle: Existing page\n---\n\nPreserve this draft.\n");
  localStorage.setItem(
    "govbb-editor:workspace:v1",
    JSON.stringify({
      version: 1,
      services: [
        {
          id: "team",
          title: "Team",
          documents: [{ id: "page", kind: "page", role: "entry", title: "Existing page", keys }],
        },
      ],
    }),
  );
});

try {
  const target = "/services/team/page?view=source#content";
  await page.goto(new URL(target, base).href);
  await page.waitForURL("https://github.com/**", { waitUntil: "commit" });
  assert.equal(signIns, 1, "anonymous entry starts GitHub once without a button");
  assert.equal(new URL(callback).searchParams.get("returnTo"), target);

  session = employeeSession();
  await page.goto(callback);
  await page.waitForURL(new URL(target, base).href);
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  assert.equal(await title.inputValue(), "Existing page");

  await page.evaluate(() => {
    window.authTestOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("govbb-editor:documents:page:"))
        throw new DOMException("Storage full", "QuotaExceededError");

      return window.authTestOriginalSetItem.call(this, key, value);
    };
  });
  await title.fill("Keep unsaved work");
  await page.getByText("Not saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Save or download this draft before leaving it. Then try again.").waitFor();
  assert.equal(signOuts, 0, "draft failure blocks session revocation");
  session = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(250);
  assert.equal(signIns, 1, "focus expiry cannot discard a blocked draft through OAuth");
  assert.equal(await title.inputValue(), "Keep unsaved work");
  await page.evaluate(() => {
    Storage.prototype.setItem = window.authTestOriginalSetItem;
  });
  session = employeeSession();
  await title.fill("Saved before sign-out");
  await page.locator('[role="status"][title="Saved"]:visible').waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "You are signed out" }).waitFor();
  assert.equal(signOuts, 1);
  assert.equal(signIns, 1, "sign-out does not immediately restart OAuth");
  assert.match(
    await page.evaluate(() => localStorage.getItem("govbb-editor:documents:page:markdown")),
    /Saved before sign-out/,
  );

  await page.goto(new URL("/auth?state=complete&returnTo=%2Fservices", base).href);
  await page.getByText(/Your sign-in could not be confirmed/).waitFor();
  assert.equal(signIns, 1, "missing callback cookie stops with recovery");
  await page.goto(new URL("/auth?state=error&error=access_denied", base).href);
  await page.getByText(/active govtech-bb membership/).waitFor();
  assert.equal(signIns, 1, "provider denial does not loop");

  unavailable = true;
  await page.goto(new URL("/services", base).href);
  await page.getByText(/We could not reach the sign-in service/).waitFor();
  assert.equal(signIns, 1, "outage does not start OAuth");
  unavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL("https://github.com/**", { waitUntil: "commit" });
  assert.equal(signIns, 2, "recovery retries only when requested");
  console.log(
    "PASS automatic GitHub login, callback, recovery, sign-out and blocked-draft preservation",
  );
} finally {
  await browser.close();
}
