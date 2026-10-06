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
  // The editor's own /services page shares the path; only the API fetch is answered.
  await context.route("**/services", (route) =>
    route.request().resourceType() === "fetch"
      ? route.fulfill({
          json: servicesFixture,
          headers: {
            "access-control-allow-origin": route.request().headers().origin ?? "*",
            "access-control-allow-credentials": "true",
            "cache-control": "no-store",
          },
        })
      : route.fallback(),
  );

  return context;
}

/** api_v2's `GET /services` rows for the Services list. */
export const servicesFixture = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    url: "/business-trade/apply-for-hotel-licence",
    title: "Apply for a hotel licence",
    category: { slug: "business-trade", title: "Business and trade" },
    visibility: "preview",
    form_id: "apply-for-hotel-licence",
    has_start_page: false,
    page_count: 1,
    updated_at: "2026-09-30T09:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    url: "/family-birth-relationships/get-birth-certificate",
    title: "Get a copy of a birth certificate",
    category: { slug: "family-birth-relationships", title: "Family, birth and relationships" },
    visibility: "public",
    form_id: "get-birth-certificate",
    has_start_page: true,
    page_count: 2,
    updated_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    url: "/health-and-emergency-services/prescription-colours",
    title: "What prescription colours mean",
    category: { slug: "health-and-emergency-services", title: "Health and emergency services" },
    visibility: "draft",
    form_id: null,
    has_start_page: false,
    page_count: 1,
    updated_at: "2026-10-02T09:00:00.000Z",
  },
];

/** Open an isolated authenticated page for existing one-page UI suites. */
export async function authenticatedPage(browser, options) {
  const context = await authenticatedContext(browser, options);

  return context.newPage();
}
