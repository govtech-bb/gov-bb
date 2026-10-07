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

/**
 * The numeric limit a route sets for one bucket, or undefined when it does not
 * override that bucket at all (in which case the global value applies).
 * @nestjs/throttler also accepts a resolver function; the file routes use plain
 * numbers, so anything else is treated as "not a pinned number" and fails the
 * assertion rather than silently passing.
 */
const throttleLimitFor = (
  target: object,
  bucket: string,
): number | undefined => {
  const value: unknown = Reflect.getMetadata(
    `THROTTLER:LIMIT${bucket}`,
    target,
  );
  return typeof value === "number" ? value : undefined;
};

/** The registered global `short` bucket — see ThrottlerModule.forRoot in app.module.ts. */
const GLOBAL_SHORT_LIMIT = 5;

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

  // #2420: overriding only "medium" leaves the global "short" bucket
  // (5 requests / 10s) in force, so it silently caps these routes below the
  // rate the "medium" override declares. A step that asks for several files
  // then trips a 429 mid-upload. Both file routes must raise "short" too, and
  // it must sit at or above the burst "medium" implies (medium / 6, since the
  // short window is a tenth of the medium one) or the tighter bucket goes on
  // quietly overriding the looser one.
  describe.each([
    ["presignUpload", FilesController.prototype.presignUpload] as const,
    ["confirmUpload", FilesController.prototype.confirmUpload] as const,
  ])("FilesController.%s throttling (#2420)", (_name, handler) => {
    it("raises the 'short' bucket above the global default", () => {
      const short = throttleLimitFor(handler, "short");
      expect(short).toBeDefined();
      expect(short).toBeGreaterThan(GLOBAL_SHORT_LIMIT);
    });

    it("does not let 'short' contradict the 'medium' override", () => {
      const short = throttleLimitFor(handler, "short");
      const medium = throttleLimitFor(handler, "medium");
      expect(medium).toBeDefined();
      // medium is per 60s, short per 10s — a sixth of medium is the sustained
      // rate the route already claims to allow.
      expect(short).toBeGreaterThanOrEqual(Math.ceil((medium as number) / 6));
    });
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
