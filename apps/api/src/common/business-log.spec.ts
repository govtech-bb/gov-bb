import { writeBusinessLog } from "./business-log";

describe("writeBusinessLog", () => {
  it("writes one JSON object per line with log_type and a timestamp", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      writeBusinessLog("business_event", { event: "submission_accepted" });
      const raw = String(write.mock.calls[0][0]);
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.trimEnd()).not.toContain("\n");
      const line = JSON.parse(raw);
      expect(line).toMatchObject({
        log_type: "business_event",
        event: "submission_accepted",
      });
      expect(new Date(line.logged_at).toString()).not.toBe("Invalid Date");
    } finally {
      write.mockRestore();
    }
  });
});
