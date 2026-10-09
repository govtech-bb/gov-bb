import type { SesMailer } from "../email/ses-mailer";
import { OpsAlertService } from "./ops-alerts.service";
import type { WaterOpsAlertRepository } from "./water-ops-alert.repository";

const SINCE = new Date("2026-10-09T04:00:00Z");

function setup() {
  const repo = {
    recordFailure: vi.fn().mockResolvedValue(null),
    recordRecovery: vi.fn().mockResolvedValue(null),
    claimNew: vi.fn().mockResolvedValue([]),
    releaseClaims: vi.fn().mockResolvedValue(undefined),
    markHealthy: vi.fn().mockResolvedValue(undefined),
    forgetAlert: vi.fn().mockResolvedValue(undefined),
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

    it("forgets the alert when its email fails, so the next run retries it", async () => {
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockResolvedValue({
        kind: "first",
        failingSince: SINCE,
      });
      mailer.sendSimple.mockRejectedValue(new Error("SES down"));

      await expect(
        service.failure("checker-crash", "boom", "Error: boom"),
      ).resolves.toBeUndefined();
      expect(repo.forgetAlert).toHaveBeenCalledWith("checker-crash");
    });

    it("says so when throttling in memory, and reminds with the still-failing subject", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockRejectedValue(new Error("connection refused"));

      await service.failure("checker-crash", "db down", "Error: db down");
      vi.setSystemTime(new Date("2026-10-09T16:00:01Z"));
      await service.failure("checker-crash", "db down", "Error: db down");

      const [first, reminder] = sent(mailer);
      expect(first.subject).toBe("Wuh Water Doing: alert checker crashed");
      expect(first.text).toContain("can't tell you when it recovers");
      expect(reminder.subject).toBe(
        "Wuh Water Doing: alert checker still failing",
      );
    });

    it("keeps throttling in memory when a recovery can't be recorded either", async () => {
      // E.g. the table is missing while the rest of the DB works: a flapping
      // crash must not email on every failure.
      const { repo, mailer, service } = setup();
      repo.recordFailure.mockRejectedValue(
        new Error("relation does not exist"),
      );
      repo.recordRecovery.mockRejectedValue(
        new Error("relation does not exist"),
      );

      await service.failure("checker-crash", "boom", "Error: boom");
      await service.recovered("checker-crash");
      await service.failure("checker-crash", "boom", "Error: boom");

      expect(mailer.sendSimple).toHaveBeenCalledTimes(1);
    });

    it("does nothing at all when WATER_OPS_RECIPIENT is unset", async () => {
      vi.stubEnv("WATER_OPS_RECIPIENT", "");
      const { repo, mailer, service } = setup();

      await service.failure("checker-crash", "boom", "Error: boom");

      expect(repo.recordFailure).not.toHaveBeenCalled();
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });
  });

  describe("newSkippedNotices", () => {
    const skipped = [
      { key: "k1", ref: '"notice-1"', reason: "link: Invalid url" },
      { key: "k9", ref: '"notice-9"', reason: "pubDate: Required" },
    ];

    it("emails only the notices it hasn't reported before, in one email", async () => {
      const { repo, mailer, service } = setup();
      repo.claimNew.mockResolvedValue(["skipped-notice:k9"]);

      await service.newSkippedNotices(skipped);

      expect(repo.claimNew).toHaveBeenCalledWith([
        "skipped-notice:k1",
        "skipped-notice:k9",
      ]);
      const [mail] = sent(mailer);
      expect(mail.subject).toBe("Wuh Water Doing: 1 BWA notice(s) skipped");
      expect(mail.text).toContain('"notice-9": pubDate: Required');
      expect(mail.text).not.toContain("notice-1");
    });

    it("stays quiet when every skipped notice was already reported", async () => {
      const { repo, mailer, service } = setup();
      repo.claimNew.mockResolvedValue([]);

      await service.newSkippedNotices(skipped);

      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });

    it("releases its claims when the email fails, so the next run retries", async () => {
      const { repo, mailer, service } = setup();
      repo.claimNew.mockResolvedValue(["skipped-notice:k9"]);
      mailer.sendSimple.mockRejectedValue(new Error("SES down"));

      await service.newSkippedNotices(skipped);

      expect(repo.releaseClaims).toHaveBeenCalledWith(["skipped-notice:k9"]);
    });

    it("never throws when releasing claims fails too", async () => {
      const { repo, mailer, service } = setup();
      repo.claimNew.mockResolvedValue(["skipped-notice:k9"]);
      repo.releaseClaims.mockRejectedValue(new Error("connection lost"));
      mailer.sendSimple.mockRejectedValue(new Error("SES down"));

      await expect(service.newSkippedNotices(skipped)).resolves.toBeUndefined();
    });

    it("does nothing for no skipped notices", async () => {
      const { repo, mailer, service } = setup();

      await service.newSkippedNotices([]);

      expect(repo.claimNew).not.toHaveBeenCalled();
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });

    it("never throws when the state table can't be reached", async () => {
      const { repo, mailer, service } = setup();
      repo.claimNew.mockRejectedValue(new Error("connection refused"));

      await expect(service.newSkippedNotices(skipped)).resolves.toBeUndefined();
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });
  });

  describe("cleared", () => {
    it("marks a signal healthy without emailing", async () => {
      const { repo, mailer, service } = setup();

      await service.cleared("send-failures");

      expect(repo.markHealthy).toHaveBeenCalledWith("send-failures");
      expect(mailer.sendSimple).not.toHaveBeenCalled();
    });

    it("never throws when the state table can't be reached", async () => {
      const { repo, service } = setup();
      repo.markHealthy.mockRejectedValue(new Error("connection refused"));

      await expect(service.cleared("send-failures")).resolves.toBeUndefined();
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
