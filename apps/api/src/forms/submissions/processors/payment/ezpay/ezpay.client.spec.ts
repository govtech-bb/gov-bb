import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of } from "rxjs";
import { EzpayClient } from "./ezpay.client";
import { EZPAY_CONFIG } from "./ezpay.config";

describe("EzpayClient", () => {
  let client: EzpayClient;
  let http: { post: jest.Mock };
  let module: TestingModule;

  beforeEach(async () => {
    http = { post: jest.fn() };
    module = await Test.createTestingModule({
      providers: [
        EzpayClient,
        { provide: HttpService, useValue: http },
        { provide: EZPAY_CONFIG, useValue: { baseUrl: "https://ezpay.test" } },
      ],
    }).compile();
    client = module.get(EzpayClient);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("createPayment posts to /ezpay_receivecart and returns token + url", async () => {
    http.post.mockReturnValue(of({ data: { token: "tok-1" } }));

    const result = await client.createPayment(
      {
        paymentCode: "EDU",
        amount: 50,
        description: "fees",
        reference: "ref-1",
        customerEmail: "a@b.c",
        customerName: "A B",
      },
      "api-key-1",
    );

    expect(result).toEqual({
      token: "tok-1",
      url: "https://ezpay.test/payment_page?token=tok-1",
    });
    expect(http.post).toHaveBeenCalledWith(
      "https://ezpay.test/ezpay_receivecart",
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ EZPluginKey: "api-key-1" }),
      }),
    );
  });

  it("createPayment throws on EzPay error response", async () => {
    http.post.mockReturnValue(
      of({ data: { error: "Invalid Payment Code", code: "E-059" } }),
    );
    await expect(
      client.createPayment(
        {
          paymentCode: "X",
          amount: 1,
          description: "d",
          reference: "r",
          customerEmail: "a",
          customerName: "n",
        },
        "key",
      ),
    ).rejects.toThrow(/E-059/);
  });

  it("verifyPayment posts to /check_api with transaction_number", async () => {
    http.post.mockReturnValue(
      of({
        data: {
          _status: "Success",
          _transaction_number: "tx-1",
          _amount: "50.00",
          _processor: "Credit Card",
          _datesettled: "2026-04-29",
          _ezpay_account: "acct-1",
        },
      }),
    );

    const r = await client.verifyPayment({ transactionNumber: "tx-1" }, "key");
    expect(r.status).toBe("Success");
    expect(r.amount).toBe(50);
  });

  it("verifyPayment includes reference in body when supplied", async () => {
    http.post.mockReturnValue(
      of({
        data: {
          _status: "Failed",
          _transaction_number: "tx-2",
          _amount: "0",
          _processor: "Credit Card",
          _datesettled: "",
          _ezpay_account: "acct",
        },
      }),
    );

    const r = await client.verifyPayment({ reference: "ref-1" }, "key");

    // assert reference made it into the form-encoded body
    const [, body] = http.post.mock.calls[0];
    expect((body as URLSearchParams).get("reference")).toBe("ref-1");
    expect((body as URLSearchParams).get("transaction_number")).toBeNull();
    // assert null-coercion for empty datesettled
    expect(r.dateSettled).toBeNull();
    expect(r.status).toBe("Failed");
  });

  it("queryTransactions posts to /transactions_api with date headers and maps Cart references", async () => {
    http.post.mockReturnValue(
      of({
        data: [
          {
            TransactionCode: "tx-101",
            Status: "Success",
            Amount: 75,
            Cart: [[{ reference: "ref-101" }]],
          },
          {
            TransactionCode: "tx-102",
            Status: "Initiated",
            Amount: 25,
            Cart: [[{ reference: "ref-102" }]],
          },
        ],
      }),
    );

    const result = await client.queryTransactions(
      "2026-04-01 00:00:00",
      "2026-04-01 23:59:59",
      "key-1",
    );

    expect(http.post).toHaveBeenCalledWith(
      "https://ezpay.test/transactions_api",
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          Apikey: "key-1",
          Startdate: "2026-04-01 00:00:00",
          Enddate: "2026-04-01 23:59:59",
        }),
      }),
    );
    expect(result).toEqual([
      {
        reference: "ref-101",
        transactionNumber: "tx-101",
        status: "Success",
        amount: 75,
      },
      {
        reference: "ref-102",
        transactionNumber: "tx-102",
        status: "Initiated",
        amount: 25,
      },
    ]);
  });

  it("queryTransactions returns empty array when EzPay returns no transactions", async () => {
    http.post.mockReturnValue(of({ data: [] }));
    const result = await client.queryTransactions(
      "2026-04-01",
      "2026-04-01",
      "key-1",
    );
    expect(result).toEqual([]);
  });
});
