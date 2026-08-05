import { WaterSubscriberStatus } from "@govtech-bb/database";
import type { SesMailer } from "../email/ses-mailer";
import { SubscriptionService } from "./subscription.service";
import type { WaterSubscriberRepository } from "./water-subscriber.repository";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ affected: 0 }),
    save: vi.fn().mockResolvedValue({}),
    create: vi.fn((x: unknown) => x),
    ...overrides,
  };
}

function makeService(repo: ReturnType<typeof makeRepo>, mailerSend = vi.fn()) {
  const mailer = { sendSimple: mailerSend } as unknown as SesMailer;
  const service = new SubscriptionService(
    repo as unknown as WaterSubscriberRepository,
    mailer,
  );
  return { service, mailer, mailerSend };
}

describe("SubscriptionService.subscribe", () => {
  it("creates a brand-new pending subscriber and emails them", async () => {
    const repo = makeRepo();
    const { service, mailerSend } = makeService(repo);

    const res = await service.subscribe("Alice@Example.com", "saint-michael");

    expect(res).toMatchObject({ ok: true, emailSent: true });
    // email + area normalised.
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        area: "saint-michael",
      }),
    );
    expect(mailerSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Confirm your water alerts" }),
    );
  });

  it('normalises "" area to "all"', async () => {
    const repo = makeRepo();
    const { service } = makeService(repo);
    await service.subscribe("a@b.com", "");
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ area: "all" }),
    );
  });

  it("does nothing extra when already confirmed", async () => {
    const repo = makeRepo({
      findOne: vi
        .fn()
        .mockResolvedValue({ status: WaterSubscriberStatus.CONFIRMED }),
    });
    const { service, mailerSend } = makeService(repo);

    const res = await service.subscribe("a@b.com", "all");

    expect(res.emailSent).toBe(false);
    expect(res.message).toMatch(/already/i);
    expect(repo.save).not.toHaveBeenCalled();
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it("reactivates an unsubscribed subscriber with a fresh token", async () => {
    const repo = makeRepo({
      findOne: vi.fn().mockResolvedValue({
        id: "id-1",
        status: WaterSubscriberStatus.UNSUBSCRIBED,
        confirmToken: "old",
      }),
    });
    const { service, mailerSend } = makeService(repo);

    await service.subscribe("a@b.com", "all");

    expect(repo.update).toHaveBeenCalledWith(
      "id-1",
      expect.objectContaining({
        status: WaterSubscriberStatus.PENDING,
        confirmedAt: null,
      }),
    );
    expect(mailerSend).toHaveBeenCalled();
  });

  it("re-sends for a pending subscriber without creating a row", async () => {
    const repo = makeRepo({
      findOne: vi.fn().mockResolvedValue({
        id: "id-2",
        status: WaterSubscriberStatus.PENDING,
        confirmToken: "tok",
      }),
    });
    const { service, mailerSend } = makeService(repo);

    await service.subscribe("a@b.com", "all");

    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(mailerSend).toHaveBeenCalled();
  });

  it("still succeeds when the email fails to send", async () => {
    const repo = makeRepo();
    const { service } = makeService(
      repo,
      vi.fn().mockRejectedValue(new Error("SES down")),
    );

    const res = await service.subscribe("a@b.com", "all");

    expect(res.ok).toBe(true);
    expect(res.emailSent).toBe(false);
  });
});

describe("SubscriptionService.confirm", () => {
  it("returns done when a pending row is flipped", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    });
    const { service } = makeService(repo);
    expect(await service.confirm("t")).toBe("done");
  });

  it("returns already when the token is an already-confirmed row", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 0 }),
      findOne: vi
        .fn()
        .mockResolvedValue({ status: WaterSubscriberStatus.CONFIRMED }),
    });
    const { service } = makeService(repo);
    expect(await service.confirm("t")).toBe("already");
  });

  it("returns invalid for an unknown token", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 0 }),
    });
    const { service } = makeService(repo);
    expect(await service.confirm("nope")).toBe("invalid");
  });
});

describe("SubscriptionService.unsubscribe", () => {
  it("returns done when an active row is unsubscribed", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    });
    const { service } = makeService(repo);
    expect(await service.unsubscribe("t")).toBe("done");
  });

  it("returns already when the row was already unsubscribed", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 0 }),
      findOne: vi
        .fn()
        .mockResolvedValue({ status: WaterSubscriberStatus.UNSUBSCRIBED }),
    });
    const { service } = makeService(repo);
    expect(await service.unsubscribe("t")).toBe("already");
  });

  it("returns invalid for an unknown token", async () => {
    const repo = makeRepo({
      update: vi.fn().mockResolvedValue({ affected: 0 }),
    });
    const { service } = makeService(repo);
    expect(await service.unsubscribe("nope")).toBe("invalid");
  });
});
