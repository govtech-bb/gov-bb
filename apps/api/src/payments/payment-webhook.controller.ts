import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { verifyEzpaySignature } from "../forms/submissions/processors/payment/ezpay/ezpay-signature";
import {
  PaymentWebhookService,
  EzpayCallbackBody,
} from "./payment-webhook.service";

@ApiTags("Payments")
@Controller("payments/ezpay")
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly service: PaymentWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async ezpayCallback(
    @Body() body: EzpayCallbackBody,
    @Headers("x-ezpay-signature") signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ acknowledged: boolean }> {
    const verifyEnabled =
      this.config.get<string>("EZPAY_WEBHOOK_VERIFY_SIGNATURE") === "true";

    if (verifyEnabled) {
      if (!req.rawBody) {
        throw new InternalServerErrorException(
          "EzPay webhook signature verification is enabled but rawBody is unavailable",
        );
      }
      const secret = this.config.get<string>("EZPAY_WEBHOOK_SECRET") ?? "";
      const raw = req.rawBody.toString("utf8");
      if (!verifyEzpaySignature(raw, signature ?? "", secret)) {
        throw new ForbiddenException("Invalid EzPay signature");
      }
    } else {
      this.logger.warn(
        `EzPay webhook signature verification is DISABLED (reference=${body._reference ?? "unknown"})`,
      );
    }

    return this.service.handleEzpayCallback(body);
  }
}
