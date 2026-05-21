import { AppController } from "./app.controller";
import { FormDefinitionsController } from "./forms/form-definitions/form-definitions.controller";
import { FormDraftsController } from "./forms/form-drafts/form-drafts.controller";
import { SubmissionsController } from "./forms/submissions/submissions.controller";
import { PaymentWebhookController } from "./payments/payment-webhook.controller";

// Pins the per-route throttler policy in place. If someone removes a
// decorator, this catches it before the change ships.
//
// @nestjs/throttler stores per-bucket metadata under keys like
// "THROTTLER:SKIPdefault" or "THROTTLER:LIMITshort" (constant + bucket name).
// We check key prefixes rather than guard behaviour because the metadata
// IS the contract — the guard reads it at request time.

const hasMetadataWithPrefix = (target: object, prefix: string): boolean =>
  (Reflect.getMetadataKeys(target) as unknown[]).some(
    (k) => typeof k === "string" && k.startsWith(prefix),
  );

const hasSkipMetadata = (target: object): boolean =>
  hasMetadataWithPrefix(target, "THROTTLER:SKIP");

const hasThrottleMetadata = (target: object): boolean =>
  hasMetadataWithPrefix(target, "THROTTLER:LIMIT") ||
  hasMetadataWithPrefix(target, "THROTTLER:TTL");

describe("throttler configuration", () => {
  it("AppController (/health) skips throttling", () => {
    expect(hasSkipMetadata(AppController)).toBe(true);
  });

  it("PaymentWebhookController skips throttling (signature-verified)", () => {
    expect(hasSkipMetadata(PaymentWebhookController)).toBe(true);
  });

  it("FormDefinitionsController carries throttle metadata for read buckets", () => {
    expect(hasThrottleMetadata(FormDefinitionsController)).toBe(true);
  });

  it("FormDraftsController carries throttle metadata for write buckets", () => {
    expect(hasThrottleMetadata(FormDraftsController)).toBe(true);
  });

  it("SubmissionsController.create carries strict throttle metadata", () => {
    expect(hasThrottleMetadata(SubmissionsController.prototype.create)).toBe(
      true,
    );
  });
});
