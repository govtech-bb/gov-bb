import {
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PaymentWebhookController } from "./payment-webhook.controller";

describe("PaymentWebhookController", () => {
  const service = {
    handleEzpayCallback: jest.fn().mockResolvedValue({ acknowledged: true }),
  };

  const makeController = (env: Record<string, string | undefined>) => {
    const config = { get: jest.fn((k: string) => env[k]) };
    return new PaymentWebhookController(service as never, config as never);
  };

  beforeEach(() => jest.clearAllMocks());

  describe("when verification is disabled (default)", () => {
    it("accepts and forwards regardless of signature", async () => {
      const ctl = makeController({ EZPAY_WEBHOOK_VERIFY_SIGNATURE: "false" });
      const body = {
        _reference: "ref-1",
        _status: "Success",
        _transaction_number: "tx-1",
        _amount: "50",
      };
      const result = await ctl.ezpayCallback(body as never, "anything", {
        rawBody: Buffer.from(JSON.stringify(body)),
      } as never);
      expect(service.handleEzpayCallback).toHaveBeenCalledWith(body);
      expect(result).toEqual({ acknowledged: true });
    });

    it("uses 'unknown' as reference placeholder when _reference is absent (line 59 ?? branch)", async () => {
      const ctl = makeController({ EZPAY_WEBHOOK_VERIFY_SIGNATURE: "false" });
      // Body without _reference triggers the `?? "unknown"` fallback in the warn log
      const body = {
        _status: "Success",
        _transaction_number: "tx-1",
        _amount: "50",
      };
      const result = await ctl.ezpayCallback(
        body as never,
        undefined,
        {} as never,
      );
      expect(service.handleEzpayCallback).toHaveBeenCalledWith(body);
      expect(result).toEqual({ acknowledged: true });
    });

    it("accepts when neither flag nor secret is set (default behavior)", async () => {
      const ctl = makeController({});
      const body = {
        _reference: "ref-x",
        _status: "Success",
        _transaction_number: "tx-x",
        _amount: "5",
      };
      const result = await ctl.ezpayCallback(body as never, undefined, {
        rawBody: Buffer.from(JSON.stringify(body)),
      } as never);
      expect(service.handleEzpayCallback).toHaveBeenCalledWith(body);
      expect(result).toEqual({ acknowledged: true });
    });
  });

  describe("when verification is enabled", () => {
    it("rejects when signature header is invalid", async () => {
      const ctl = makeController({
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true",
        EZPAY_WEBHOOK_SECRET: "secret",
      });
      const body = { _reference: "ref", _status: "Success" };
      await expect(
        ctl.ezpayCallback(body as never, "deadbeef", {
          rawBody: Buffer.from(JSON.stringify(body)),
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.handleEzpayCallback).not.toHaveBeenCalled();
    });

    it("forwards to service when signature is valid", async () => {
      const ctl = makeController({
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true",
        EZPAY_WEBHOOK_SECRET: "secret",
      });
      const body = {
        _reference: "ref-1",
        _status: "Success",
        _transaction_number: "tx-1",
        _amount: "50",
      };
      const raw = JSON.stringify(body);
      const sig = createHmac("sha256", "secret").update(raw).digest("hex");
      const result = await ctl.ezpayCallback(body as never, sig, {
        rawBody: Buffer.from(raw),
      } as never);
      expect(service.handleEzpayCallback).toHaveBeenCalledWith(body);
      expect(result).toEqual({ acknowledged: true });
    });

    it("rejects when secret is missing (fail-closed)", async () => {
      const ctl = makeController({ EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true" });
      const body = { _reference: "ref", _status: "Success" };
      await expect(
        ctl.ezpayCallback(body as never, "anything", {
          rawBody: Buffer.from(JSON.stringify(body)),
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.handleEzpayCallback).not.toHaveBeenCalled();
    });

    it("rejects when signature header is missing", async () => {
      const ctl = makeController({
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true",
        EZPAY_WEBHOOK_SECRET: "secret",
      });
      const body = { _reference: "ref", _status: "Success" };
      await expect(
        ctl.ezpayCallback(body as never, undefined, {
          rawBody: Buffer.from(JSON.stringify(body)),
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.handleEzpayCallback).not.toHaveBeenCalled();
    });

    it("throws InternalServerErrorException when rawBody is missing under verification", async () => {
      const ctl = makeController({
        EZPAY_WEBHOOK_VERIFY_SIGNATURE: "true",
        EZPAY_WEBHOOK_SECRET: "secret",
      });
      const body = { _reference: "ref", _status: "Success" };
      await expect(
        ctl.ezpayCallback(body as never, "anything", {
          rawBody: undefined,
        } as never),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(service.handleEzpayCallback).not.toHaveBeenCalled();
    });
  });
});
