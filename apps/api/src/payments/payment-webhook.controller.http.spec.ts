import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";
import { PaymentWebhookController } from "./payment-webhook.controller";
import { PaymentWebhookService } from "./payment-webhook.service";
import { useBodyParsers } from "@/common/body-parsers";

/**
 * Wire-level guard for POST /payments/ezpay/webhook with signature checking ON
 * (#3012). The unit spec calls the controller method with a hand-built
 * `rawBody`; it can't see whether a real request through main.ts's body
 * parsers still carries the raw bytes the HMAC is computed over.
 *
 * Boots the controller the way main.ts does (`rawBody: true` plus the shared
 * `useBodyParsers`), with the service and config mocked so it runs without a
 * DB. Before #3012 main.ts registered a plain `express.json()`, which left
 * `rawBody` unset and turned every signed webhook into a 500.
 * "Refused" means a 403 and the callback never reaching
 * `handleEzpayCallback` — the only path that confirms a payment.
 */

// Random per run: a throwaway key for signing test callbacks, not a credential.
const SECRET = randomBytes(32).toString("hex");

const callback = {
  _reference: "pay-ref-1",
  _status: "Success",
  _transaction_number: "tx-1",
  _amount: "5.00",
};

const sign = (raw: string) =>
  createHmac("sha256", SECRET).update(raw).digest("hex");

describe("POST /payments/ezpay/webhook — signature verification over HTTP", () => {
  let app: NestExpressApplication;
  const handleEzpayCallback = vi.fn();
  // Read per request by the controller, so a test can switch verification off.
  const env: Record<string, string> = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentWebhookController],
      providers: [
        { provide: PaymentWebhookService, useValue: { handleEzpayCallback } },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    useBodyParsers(app);
    await app.init();
  });

  beforeEach(() => {
    env.EZPAY_WEBHOOK_VERIFY_SIGNATURE = "true";
    env.EZPAY_WEBHOOK_SECRET = SECRET;
    handleEzpayCallback.mockReset();
    handleEzpayCallback.mockResolvedValue({ acknowledged: true });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const post = (raw: string, signature?: string) => {
    const req = request(app.getHttpServer())
      .post("/payments/ezpay/webhook")
      .set("Content-Type", "application/json");
    if (signature !== undefined) req.set("X-EzPay-Signature", signature);
    return req.send(raw);
  };

  it("refuses a webhook signed with the wrong secret", async () => {
    const raw = JSON.stringify(callback);
    const forged = createHmac("sha256", randomBytes(32))
      .update(raw)
      .digest("hex");

    const res = await post(raw, forged);

    expect(res.status).toBe(403);
    expect(handleEzpayCallback).not.toHaveBeenCalled();
  });

  it("refuses a webhook whose body was changed after signing", async () => {
    const signature = sign(JSON.stringify(callback));
    const tampered = JSON.stringify({ ...callback, _amount: "0.01" });

    const res = await post(tampered, signature);

    expect(res.status).toBe(403);
    expect(handleEzpayCallback).not.toHaveBeenCalled();
  });

  it("refuses a webhook with no signature header", async () => {
    const res = await post(JSON.stringify(callback));

    expect(res.status).toBe(403);
    expect(handleEzpayCallback).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed webhook and hands it on", async () => {
    const raw = JSON.stringify(callback);

    const res = await post(raw, sign(raw));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ acknowledged: true });
    expect(handleEzpayCallback).toHaveBeenCalledWith(callback);
  });

  // Express 4's express.json (registered here before #3012) always left
  // req.body as {}; Nest's own parsers leave it undefined for a body they
  // don't parse. useBodyParsers keeps {} so the webhook still acknowledges.
  it("acknowledges an unparsed body when verification is off", async () => {
    env.EZPAY_WEBHOOK_VERIFY_SIGNATURE = "false";

    const res = await request(app.getHttpServer())
      .post("/payments/ezpay/webhook")
      .set("Content-Type", "text/plain")
      .send("not json");

    expect(res.status).toBe(200);
    expect(handleEzpayCallback).toHaveBeenCalledWith({});
  });
});
