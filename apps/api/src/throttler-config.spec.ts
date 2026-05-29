import { AppController } from "./app.controller";
import { FormDefinitionsController } from "./forms/form-definitions/form-definitions.controller";
import { FormDraftsController } from "./forms/form-drafts/form-drafts.controller";
import { SubmissionsController } from "./forms/submissions/submissions.controller";
import { PaymentWebhookController } from "./payments/payment-webhook.controller";
import { FilesController } from "./files/files.controller";

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

  // #295: the routes must override a registered bucket ("medium"), not an
  // unknown "default" name (which @nestjs/throttler treats as a 4th ad-hoc
  // throttler stacked on the globals rather than an override).
  it("FilesController.presignUpload overrides the registered 'medium' bucket, not 'default'", () => {
    expect(
      hasMetadataWithPrefix(
        FilesController.prototype.presignUpload,
        "THROTTLER:LIMITmedium",
      ),
    ).toBe(true);
    expect(
      hasMetadataWithPrefix(
        FilesController.prototype.presignUpload,
        "THROTTLER:LIMITdefault",
      ),
    ).toBe(false);
  });

  it("FilesController.confirmUpload overrides the registered 'medium' bucket, not 'default'", () => {
    expect(
      hasMetadataWithPrefix(
        FilesController.prototype.confirmUpload,
        "THROTTLER:LIMITmedium",
      ),
    ).toBe(true);
    expect(
      hasMetadataWithPrefix(
        FilesController.prototype.confirmUpload,
        "THROTTLER:LIMITdefault",
      ),
    ).toBe(false);
  });
});
