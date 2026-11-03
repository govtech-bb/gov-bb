import type { Mock } from "vitest";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { FormSubmissionStatus } from "@/database/entities/form-submission.entity";
import type { FormSubmissionRepository } from "../form-submission.repository";
import type { SubmissionPipelineService } from "../submission-pipeline.service";
import { SubmissionStatusService } from "./submission-status.service";

const NOT_CAMS = [{ type: "email", config: {} }];
const CAMS = [
  { type: "webhook", config: { mapping: { programmeCode: "MOH" } } },
];

function makeService(
  row: Record<string, unknown> | null,
  contract: Promise<unknown> = Promise.resolve({ processors: NOT_CAMS }),
) {
  const repo = {
    findByReference: vi.fn().mockResolvedValue(row),
  } as unknown as FormSubmissionRepository;
  const pipeline = {
    resolveContract: vi.fn().mockReturnValue(contract),
  } as unknown as SubmissionPipelineService;
  return {
    repo,
    pipeline,
    service: new SubmissionStatusService(repo, pipeline),
  };
}

const SUBMITTED = {
  referenceCode: "NRA-2609-7QK2M4D",
  formId: "apply-for-a-thing",
  status: FormSubmissionStatus.SUBMITTED,
  submittedAt: new Date("2026-09-12T14:04:00Z"),
};

describe("SubmissionStatusService (#3419)", () => {
  describe("not_found", () => {
    it("answers not_found for an unknown reference", async () => {
      const { service } = makeService(null);
      await expect(service.lookup("MOH-TRL-2610-47E4AE6")).resolves.toEqual({
        kind: "not_found",
        reference: "MOH-TRL-2610-47E4AE6",
      });
    });

    // Malformed and unknown look the same: there is no format check to fail,
    // so a malformed reference takes the same path as an unknown one.
    it("answers not_found for a malformed reference, with no validation error", async () => {
      const { repo, service } = makeService(null);
      const long = "x".repeat(500);
      await expect(service.lookup(long)).resolves.toEqual({
        kind: "not_found",
        reference: long.toUpperCase(),
      });
      expect(repo.findByReference as Mock).toHaveBeenCalledTimes(1);
    });

    // Waiting on payment: nothing has reached the department yet (Tarika, 3 Nov).
    it("answers not_found for a submission that was never completed", async () => {
      const { pipeline, service } = makeService({
        ...SUBMITTED,
        status: FormSubmissionStatus.PENDING_PAYMENT,
        submittedAt: null,
      });
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "not_found",
        reference: "NRA-2609-7QK2M4D",
      });
      expect(pipeline.resolveContract as Mock).not.toHaveBeenCalled();
    });
  });

  it("trims and uppercases the reference before looking it up", async () => {
    const { repo, service } = makeService(SUBMITTED);
    const answer = await service.lookup("  nra-2609-7qk2m4d ");
    expect(repo.findByReference as Mock).toHaveBeenCalledWith(
      "NRA-2609-7QK2M4D",
    );
    expect(answer.reference).toBe("NRA-2609-7QK2M4D");
  });

  describe("untracked", () => {
    // Exact equality: a field beyond the contract fails the test, so nothing
    // else about the application can leak through this answer.
    it("answers untracked with the date received for a form not sent to CaMS", async () => {
      const { pipeline, service } = makeService(SUBMITTED);
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "untracked",
        reference: "NRA-2609-7QK2M4D",
        receivedAt: "2026-09-12T14:04:00.000Z",
      });
      // A form taken offline still has its recipe and its submissions.
      expect(pipeline.resolveContract as Mock).toHaveBeenCalledWith(
        "apply-for-a-thing",
        true,
      );
    });
  });

  // Until the tracker lookup lands (T4), anything that needs it is an outage,
  // never a guess: the chat shows "We cannot check your application right now".
  describe("needs the tracker", () => {
    it("is unavailable for a form sent to CaMS", async () => {
      const { service } = makeService(
        SUBMITTED,
        Promise.resolve({ processors: CAMS }),
      );
      await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("is unavailable for a form whose recipe has been deleted", async () => {
      const { service } = makeService(
        SUBMITTED,
        Promise.reject(new NotFoundException()),
      );
      await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  it("lets any other recipe failure through", async () => {
    const boom = new Error("database down");
    const { service } = makeService(SUBMITTED, Promise.reject(boom));
    await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBe(boom);
  });
});
