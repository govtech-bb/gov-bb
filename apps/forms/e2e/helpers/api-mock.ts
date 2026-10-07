import { test as base, expect } from "@playwright/test";
import type { UploadedFile } from "../../src/types/props.type";
import type {
  PresignUploadRequest,
  ConfirmUploadRequest,
} from "../../src/lib/api/files";

export { expect };

// The master form is bundled. Keep uploads and submissions local to each test.
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const files = new Map<string, UploadedFile>();
    const uploaded = new Set<string>();
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Recipe-Preview, X-Recipe-Draft",
    };

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
      } else if (
        method === "POST" &&
        url.pathname.endsWith("/files/presign-upload")
      ) {
        const body = request.postDataJSON() as PresignUploadRequest;
        const key = `test-upload-${files.size + 1}`;
        files.set(key, {
          key,
          name: body.fileName,
          size: body.size,
          type: body.contentType,
        });
        await route.fulfill({
          headers,
          json: {
            status: "success",
            data: {
              uploadUrl: `${origin}/__mock_uploads/${key}`,
              key,
              expiresIn: 60,
              maxSize: 10 * 1024 * 1024,
            },
          },
        });
      } else if (
        method === "PUT" &&
        url.origin === origin &&
        url.pathname.startsWith("/__mock_uploads/")
      ) {
        const key = url.pathname.split("/").at(-1)!;
        expect(files.has(key)).toBe(true);
        uploaded.add(key);
        await route.fulfill({ status: 200, body: "" });
      } else if (
        method === "POST" &&
        url.pathname.endsWith("/files/confirm-upload")
      ) {
        const { key } = request.postDataJSON() as ConfirmUploadRequest;
        expect(uploaded.has(key)).toBe(true);
        await route.fulfill({
          headers,
          json: { status: "success", data: files.get(key) },
        });
      } else if (method === "POST" && url.pathname.endsWith("/submissions")) {
        const now = new Date().toISOString();
        await route.fulfill({
          headers,
          json: {
            status: "success",
            data: {
              id: "TEST-REF-001",
              createdAt: now,
              updatedAt: now,
              submittedAt: now,
              idempotencyKey: "test-idempotency-key",
              formId: "master-form-v1",
              formVersion: "1.0.0",
              status: "success",
              values: {},
              meta: null,
            },
          },
        });
      } else if (method === "GET" && url.origin === origin) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
    await use(page);
  },
});
