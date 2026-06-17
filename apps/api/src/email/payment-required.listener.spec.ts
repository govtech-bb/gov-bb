import type { Mocked } from "vitest";
import { PaymentRequiredListener } from "./payment-required.listener";
import type { SesMailer } from "./ses-mailer";
import type { EmailTemplateService } from "./email-template.service";
import type { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { PaymentRequiredEvent } from "../forms/submissions/submissions.types";

function makeEvent(
  overrides: Partial<PaymentRequiredEvent> = {},
): PaymentRequiredEvent {
  return {
    customerEmail: "citizen@example.com",
    formId: "birth-certificate",
    formVersion: "1.0.0",
    referenceCode: "BC-20260617-000001",
    submissionId: "sub-1",
    amount: 5,
    description: "Birth Certificate - 1 copy",
    paymentUrl: "https://ezpay.example/pay?token=abc",
    ...overrides,
  };
}

function makeFormDefs(
  title = "Birth Certificate",
): Mocked<FormDefinitionsService> {
  return {
    findByFormId: vi
      .fn()
      .mockResolvedValue({ title } as unknown as ServiceContract),
  } as unknown as Mocked<FormDefinitionsService>;
}

function makeTemplateService(
  html: string | null = "<h1>Payment required</h1>",
): Mocked<EmailTemplateService> {
  return {
    render: vi.fn().mockReturnValue(html),
  } as unknown as Mocked<EmailTemplateService>;
}

function makeMailer(
  coatOfArmsUrl: string | undefined = undefined,
): Mocked<SesMailer> {
  return {
    coatOfArmsUrl,
    sendSimple: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<SesMailer>;
}

describe("PaymentRequiredListener", () => {
  it("renders payment-required and sends it to the citizen", async () => {
    const templateSvc = makeTemplateService();
    const mailer = makeMailer("https://forms.gov.bb/images/coat-of-arms.png");
    const formDefs = makeFormDefs("Birth Certificate");
    const listener = new PaymentRequiredListener(formDefs, templateSvc, mailer);

    await listener.handlePaymentRequired(makeEvent());

    expect(formDefs.findByFormId).toHaveBeenCalledWith({
      formId: "birth-certificate",
      version: "1.0.0",
    });
    expect(templateSvc.render).toHaveBeenCalledWith(
      "payment-required",
      expect.objectContaining({
        formTitle: "Birth Certificate",
        amountDue: "$5.00",
        description: "Birth Certificate - 1 copy",
        referenceCode: "BC-20260617-000001",
        paymentUrl: "https://ezpay.example/pay?token=abc",
        coatOfArmsUrl: "https://forms.gov.bb/images/coat-of-arms.png",
      }),
    );
    expect(mailer.sendSimple).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "citizen@example.com",
        subject: expect.stringContaining("Birth Certificate"),
        html: "<h1>Payment required</h1>",
      }),
    );
  });

  it("does not throw when the send fails (best-effort, logged not rethrown)", async () => {
    const mailer = makeMailer();
    mailer.sendSimple.mockRejectedValueOnce(new Error("SES throttled"));
    const listener = new PaymentRequiredListener(
      makeFormDefs(),
      makeTemplateService(),
      mailer,
    );

    await expect(
      listener.handlePaymentRequired(makeEvent()),
    ).resolves.toBeUndefined();
  });

  it("skips the send and does not throw when the template fails to render", async () => {
    const mailer = makeMailer();
    const listener = new PaymentRequiredListener(
      makeFormDefs(),
      makeTemplateService(null),
      mailer,
    );

    await expect(
      listener.handlePaymentRequired(makeEvent()),
    ).resolves.toBeUndefined();
    expect(mailer.sendSimple).not.toHaveBeenCalled();
  });
});
