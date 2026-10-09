import type { SesMailer } from "../email/ses-mailer";
import { OpsAlertService } from "./ops-alerts.service";
import type { WaterOpsAlertRepository } from "./water-ops-alert.repository";

const SINCE = new Date("2026-10-09T04:00:00Z");

function setup() {
  const repo = {
    recordFailure: vi.fn().mockResolvedValue(null),
    recordRecovery: vi.fn().mockResolvedValue(null),
    claimNew: vi.fn().mockResolvedValue([]),
  };
  const mailer = { sendSimple: vi.fn().mockResolvedValue(undefined) };
  const service = new OpsAlertService(
    repo as unknown as WaterOpsAlertRepository,
    mailer as unknown as SesMailer,
  );
  return { repo, mailer, service };
}

const sent = (mailer: { sendSimple: ReturnType<typeof vi.fn> }) =>
  mailer.sendSimple.mock.calls.map(
    ([args]) => args as { to: string; subject: string; text: string },
  );

describe("OpsAlertService", () => {
  beforeEach(() => vi.stubEnv("WATER_OPS_RECIPIENT", "ops@example.test"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("failure", () => {
    it("emails once when a failure starts, summary first then the details", async () => {
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockResolvedValue({
        kind: "first",
        failingSince: SINCE,
      });

      await service.failure(
        "checker-crash",
        "rss.channel: Required",
        "ZodError: [...]",
      );

      expect(repo.recordFailure).toHaveBeenCalledWith(
        "checker-crash",
        "6 hours",
      );
      const [mail] = sent(mailer);
      expect(mail.to).toBe("ops@example.test");
      expect(mail.subject).toBe("Wuh Water Doing: alert checker crashed");
      expect(mail.text.split("\n")[0]).toBe("rss.channel: Required");
      expect(mail.text).toContain("every 6 hours");
      expect(mail.text).toContain("ZodError: [...]");
    });

    it("stays quiet while the failure continues and was alerted recently", async () => {
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockResolvedValue(null);

      await service.failure("checker-crash", "boom", "Error: boom");

      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });

    it("sends a reminder once the interval has passed", async () => {
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockResolvedValue({
        kind: "reminder",
        failingSince: SINCE,
      });

      await service.failure("send-failures", "3 alert send(s) failed", "{}");

      const [mail] = sent(mailer);
      expect(mail.subject).toBe("Wuh Water Doing: alert sends still failing");
      expect(mail.text).toContain(`since ${SINCE.toISOString()}`);
    });

    it("throttles in memory when the state table can't be reached", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockRejectedValue(new Error("connection refused"));

      await service.failure("checker-crash", "db down", "Error: db down");
      await service.failure("checker-crash", "db down", "Error: db down");
      expect(mailer.sendSimple).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-10-09T16:00:01Z"));
      await service.failure("checker-crash", "db down", "Error: db down");
      expect(mailer.sendSimple).toHaveBeenCalledTimes(2);
    });

    it("never throws when the ops email itself fails", async () => {
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockResolvedValue({
        kind: "first",
        failingSince: SINCE,
      });
      mailer.sendSimple.mockRejectedValue(new Error("SES down"));

      await expect(
        service.failure("checker-crash", "boom", "Error: boom"),
      ).resolves.toBeUndefined();
    });

    it("does nothing at all when WATER_OPS_RECIPIENT is unset", async () => {
      vi.stubEnv("WATER_OPS_RECIPIENT", "");
      const { repo, mailer, service } = setup();

      await service.failure("checker-crash", "boom", "Error: boom");

      expect(repo.recordFailure).not.toHaveBeenCalled();
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });
  });

  describe("recovered", () => {
    it("emails once when a failing signal recovers", async () => {
      const { repo, mailer, service } = setup();
      repo.recordRecovery.mockResolvedValue(SINCE);

      await service.recovered("checker-crash");

      expect(repo.recordRecovery).toHaveBeenCalledWith("checker-crash");
      const [mail] = sent(mailer);
      expect(mail.subject).toBe("Wuh Water Doing: alert checker recovered");
      expect(mail.text).toContain(`failing since ${SINCE.toISOString()}`);
    });

    it("stays quiet when the signal wasn't failing", async () => {
      const { repo, mailer, service } = setup();
      repo.recordRecovery.mockResolvedValue(null);

      await service.recovered("send-failures");

      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });

    it("never throws when the state table can't be reached", async () => {
      const { repo, mailer, service } = setup();
      repo.recordRecovery.mockRejectedValue(new Error("connection refused"));

      await expect(service.recovered("checker-crash")).resolves.toBeUndefined();
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });
  });
});
