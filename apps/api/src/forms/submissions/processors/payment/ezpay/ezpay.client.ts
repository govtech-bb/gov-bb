import { Inject, Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { EZPAY_CONFIG, EzpayConfig } from "./ezpay.config";
import {
  CreatePaymentParams,
  CreatePaymentResult,
  VerifyPaymentResult,
  QueryTransactionItem,
} from "./ezpay.types";

@Injectable()
export class EzpayClient {
  private readonly logger = new Logger(EzpayClient.name);

  constructor(
    private readonly http: HttpService,
    @Inject(EZPAY_CONFIG) private readonly config: EzpayConfig,
  ) {}

  async createPayment(
    p: CreatePaymentParams,
    apiKey: string,
  ): Promise<CreatePaymentResult> {
    const form = new URLSearchParams();
    form.set(
      "ez_cart_array",
      JSON.stringify([
        {
          code: p.paymentCode,
          amount: p.amount,
          details: p.description,
          reference: p.reference,
        },
      ]),
    );
    form.set("ez_reference_email", p.customerEmail);
    form.set("ez_reference_name", p.customerName);
    form.set("ez_reference_number", p.reference);
    form.set("ez_allow_credit", p.allowCredit === false ? "0" : "1");
    form.set("ez_allow_debit", p.allowDebit === false ? "0" : "1");
    form.set("ez_allow_payce", p.allowPayce === false ? "0" : "1");

    const resp = await firstValueFrom(
      this.http.post<{ token?: string; error?: string; code?: string }>(
        `${this.config.baseUrl}/ezpay_receivecart`,
        form,
        {
          timeout: 30_000,
          headers: {
            EZPluginKey: apiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      ),
    );

    if (resp.data.error) {
      throw new Error(
        `EzPay createPayment failed [${resp.data.code ?? "?"}]: ${resp.data.error}`,
      );
    }
    if (!resp.data.token)
      throw new Error("EzPay createPayment: no token in response");

    return {
      token: resp.data.token,
      url: `${this.config.baseUrl}/payment_page?token=${resp.data.token}`,
    };
  }

  async verifyPayment(
    args: { transactionNumber?: string; reference?: string },
    apiKey: string,
  ): Promise<VerifyPaymentResult> {
    const form = new URLSearchParams();
    if (args.transactionNumber)
      form.set("transaction_number", args.transactionNumber);
    if (args.reference) form.set("reference", args.reference);

    const resp = await firstValueFrom(
      this.http.post<Record<string, string>>(
        `${this.config.baseUrl}/check_api`,
        form,
        {
          timeout: 30_000,
          headers: {
            EZPluginKey: apiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      ),
    );
    const d = resp.data;
    return {
      status: d._status as VerifyPaymentResult["status"],
      transactionNumber: d._transaction_number,
      amount: Number(d._amount),
      processor: d._processor,
      dateSettled: d._datesettled || null,
      account: d._ezpay_account,
    };
  }

  async queryTransactions(
    startDate: string,
    endDate: string,
    apiKey: string,
  ): Promise<QueryTransactionItem[]> {
    const resp = await firstValueFrom(
      this.http.post<unknown>(
        `${this.config.baseUrl}/transactions_api`,
        {},
        {
          timeout: 60_000,
          headers: { Apikey: apiKey, Startdate: startDate, Enddate: endDate },
        },
      ),
    );

    return this.coerceTransactionList(resp.data).map((tx) => {
      const cart = tx.Cart as Array<Array<{ reference?: string }>> | undefined;
      const reference = cart?.[0]?.[0]?.reference ?? "";
      return {
        reference,
        transactionNumber: String(tx.TransactionCode ?? ""),
        status: String(
          tx.Status ?? "Initiated",
        ) as VerifyPaymentResult["status"],
        amount: Number(tx.Amount ?? 0),
      };
    });
  }

  /**
   * EzPay's /transactions_api returns the transaction array directly on a
   * normal success, but other shapes occur in practice — an error/access
   * object (e.g. when the caller IP isn't whitelisted) or the list wrapped
   * under a property. The previous code assumed a bare array and crashed
   * (`.map is not a function`) on anything else, which broke the
   * reconciliation cron entirely. Coerce defensively: pass arrays through,
   * dig out the first array-valued property of an object, otherwise log the
   * shape (so the real response can be diagnosed) and treat as no
   * transactions rather than throwing.
   */
  private coerceTransactionList(data: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(data)) {
      return data as Array<Record<string, unknown>>;
    }
    if (data && typeof data === "object") {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          return value as Array<Record<string, unknown>>;
        }
      }
      this.logger.warn(
        `[ezpay] /transactions_api returned a non-array body (keys: ${
          Object.keys(data as object).join(", ") || "none"
        }) — treating as no transactions. If unexpected, check the EzPay IP allowlist for the NAT egress EIP.`,
      );
    } else if (data != null) {
      this.logger.warn(
        `[ezpay] /transactions_api returned a ${typeof data} body — treating as no transactions`,
      );
    }
    return [];
  }
}
