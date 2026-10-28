import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateFeedbackDto } from "./create-feedback.dto";

async function validateDto(
  payload: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(CreateFeedbackDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe("CreateFeedbackDto", () => {
  it("accepts a submission with only visitReason filled", async () => {
    expect(await validateDto({ visitReason: "Renewing my passport" })).toEqual(
      [],
    );
  });

  it("accepts a submission with only whatWentWrong filled", async () => {
    expect(await validateDto({ whatWentWrong: "Page crashed" })).toEqual([]);
  });

  it("rejects a submission where both fields are blank", async () => {
    const messages = await validateDto({
      visitReason: "   ",
      whatWentWrong: "",
    });
    expect(messages).toContain("At least one feedback field is required");
  });

  it("rejects a submission with neither field present", async () => {
    const messages = await validateDto({ referrer: "/feedback" });
    expect(messages).toContain("At least one feedback field is required");
  });

  it("accepts a valid optional email", async () => {
    expect(
      await validateDto({
        visitReason: "Renewing my passport",
        email: "visitor@example.com",
      }),
    ).toEqual([]);
  });

  it("accepts a submission with no email (stays anonymous)", async () => {
    expect(await validateDto({ visitReason: "Renewing my passport" })).toEqual(
      [],
    );
  });

  it("rejects a malformed email", async () => {
    const messages = await validateDto({
      visitReason: "Renewing my passport",
      email: "not-an-email",
    });
    expect(messages.some((m) => /email/i.test(m))).toBe(true);
  });

  it("rejects an over-long email", async () => {
    const messages = await validateDto({
      visitReason: "Renewing my passport",
      email: `${"a".repeat(250)}@example.com`,
    });
    expect(messages.some((m) => /email/i.test(m))).toBe(true);
  });
});
