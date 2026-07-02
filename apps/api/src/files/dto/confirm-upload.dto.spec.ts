import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConfirmUploadDto } from "./confirm-upload.dto";

const VALID = {
  key: "uploads/passport-renewal/documents/policeCertificate/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf",
  formId: "passport-renewal",
  stepId: "documents",
  fieldId: "policeCertificate",
};

async function fieldsWithErrors(
  payload: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(ConfirmUploadDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe("ConfirmUploadDto", () => {
  it("accepts a new-format key with the embedded tuple", async () => {
    expect(await fieldsWithErrors(VALID)).toEqual([]);
  });

  it("accepts a legacy tuple-less key (rollout backward-compat, #284)", async () => {
    expect(
      await fieldsWithErrors({
        ...VALID,
        key: "uploads/passport-renewal/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf",
      }),
    ).toEqual([]);
  });

  it("rejects a key with a path-traversal segment", async () => {
    expect(
      await fieldsWithErrors({
        ...VALID,
        key: "uploads/passport-renewal/../../etc/passwd",
      }),
    ).toContain("key");
  });

  it("rejects a fieldId containing path separators (#284 path-safety)", async () => {
    expect(await fieldsWithErrors({ ...VALID, fieldId: "a/../b" })).toContain(
      "fieldId",
    );
  });

  it("accepts a camelCase fieldId", async () => {
    expect(
      await fieldsWithErrors({ ...VALID, fieldId: "policeCertificate" }),
    ).toEqual([]);
  });
});
