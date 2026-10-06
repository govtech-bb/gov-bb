/** An authenticated API response for editor UI regressions; never loaded by production. */
export function employeeSession() {
  const createdAt = new Date().toISOString();

  return {
    session: {
      id: "test-session",
      userId: "test-user",
      token: "test-token",
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    },
    user: {
      id: "test-user",
      name: "Test employee",
      email: "employee@govtech.bb",
      emailVerified: true,
      image: null,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

/** Compose real editor/browser code with a session fixture at its HTTP boundary. */
export async function authenticatedContext(browser, options) {
  const context = await browser.newContext(options);
  await context.route("**/api/auth/get-session*", (route) =>
    route.fulfill({
      json: employeeSession(),
      headers: {
        "access-control-allow-origin": route.request().headers().origin ?? "*",
        "access-control-allow-credentials": "true",
        "cache-control": "no-store",
      },
    }),
  );

  return context;
}

/** Open an isolated authenticated page for existing one-page UI suites. */
export async function authenticatedPage(browser, options) {
  const context = await authenticatedContext(browser, options);

  return context.newPage();
}
