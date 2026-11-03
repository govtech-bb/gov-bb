import type { Mock } from "vitest";
import {
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FormSubmissionStatus } from "@/database/entities/form-submission.entity";
import type { FormSubmissionRepository } from "../form-submission.repository";
import type { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import { SubmissionStatusService } from "./submission-status.service";
import {
  TrackerLookupError,
  type TrackerLookupClient,
} from "./tracker-lookup.client";

const NOT_CAMS = [{ type: "email", config: {} }];
const CAMS = [
  { type: "webhook", config: { mapping: { programmeCode: "MOH" } } },
];

function makeService(
  row: Record<string, unknown> | null,
  contract: () => Promise<unknown> = async () => ({ processors: NOT_CAMS }),
  trackerAnswer: () => Promise<unknown> = async () => {
    throw new Error("the tracker should not be asked");
  },
) {
  const repo = {
    findByReference: vi.fn().mockResolvedValue(row),
  } as unknown as FormSubmissionRepository;
  const formDefs = {
    findByFormId: vi.fn().mockImplementation(contract),
  } as unknown as FormDefinitionsService;
  const tracker = {
    lookup: vi.fn().mockImplementation(trackerAnswer),
  } as unknown as TrackerLookupClient;
  return {
    repo,
    formDefs,
    tracker,
    service: new SubmissionStatusService(repo, formDefs, tracker),
  };
}

const camsRecipe = async () => ({ processors: CAMS });
const deletedRecipe = async () => {
  throw new NotFoundException();
};

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
      const { formDefs, service } = makeService({
        ...SUBMITTED,
        status: FormSubmissionStatus.PENDING_PAYMENT,
        submittedAt: null,
      });
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "not_found",
        reference: "NRA-2609-7QK2M4D",
      });
      expect(formDefs.findByFormId as Mock).not.toHaveBeenCalled();
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
    // formId (#3434) lets the chat name the service and link its page, which
    // carries the department's contact details.
    it("answers untracked with the date received and the form, for a form not sent to CaMS", async () => {
      const { formDefs, service } = makeService(SUBMITTED);
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "untracked",
        reference: "NRA-2609-7QK2M4D",
        receivedAt: "2026-09-12T14:04:00.000Z",
        formId: "apply-for-a-thing",
      });
      // The published recipe, past the visibility gate (a form taken offline
      // still has submissions), and never the submit path's draft check: a
      // builder draft of a deleted form used to turn the answer into a 400.
      expect(formDefs.findByFormId as Mock).toHaveBeenCalledWith({
        formId: "apply-for-a-thing",
        includeProcessors: true,
        bypassVisibility: true,
      });
    });
  });

  describe("a form sent to CaMS", () => {
    it("answers found with the tracker's status and when it changed", async () => {
      const { tracker, service } = makeService(
        SUBMITTED,
        camsRecipe,
        async () => ({
          found: true,
          status: "in_progress",
          occurredAt: "2026-10-21T18:28:00Z",
        }),
      );
      await expect(service.lookup("nra-2609-7qk2m4d")).resolves.toEqual({
        kind: "found",
        reference: "NRA-2609-7QK2M4D",
        status: "in_progress",
        updatedAt: "2026-10-21T18:28:00Z",
      });
      expect(tracker.lookup as Mock).toHaveBeenCalledWith("NRA-2609-7QK2M4D");
    });

    // Not mapped (Tarika, 3 Nov): the chat shows a status it doesn't know as
    // "We can't show this result here", with a link to the tracker.
    it("passes a status the chat doesn't know through unchanged", async () => {
      const { service } = makeService(SUBMITTED, camsRecipe, async () => ({
        found: true,
        status: "closed",
        occurredAt: "2026-10-21T18:28:00Z",
      }));
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toMatchObject({
        kind: "found",
        status: "closed",
      });
    });

    // Before its first status event, or while status publishing is off for
    // that CaMS deployment. It really was received (Tarika, 3 Nov).
    it("answers found + received, as of when it was submitted, when the tracker has no record yet", async () => {
      const { service } = makeService(SUBMITTED, camsRecipe, async () => ({
        found: false,
      }));
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "found",
        reference: "NRA-2609-7QK2M4D",
        status: "received",
        updatedAt: "2026-09-12T14:04:00.000Z",
      });
    });
  });

  // The recipe can't say whether the form went to CaMS any more, so the
  // tracker decides (Tarika, 3 Nov): a record means it did.
  describe("a form whose recipe has been deleted", () => {
    it("answers found when the tracker has a record", async () => {
      const { service } = makeService(SUBMITTED, deletedRecipe, async () => ({
        found: true,
        status: "approved",
        occurredAt: "2026-10-15T18:28:00Z",
      }));
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "found",
        reference: "NRA-2609-7QK2M4D",
        status: "approved",
        updatedAt: "2026-10-15T18:28:00Z",
      });
    });

    it("answers untracked when the tracker has no record", async () => {
      const { service } = makeService(SUBMITTED, deletedRecipe, async () => ({
        found: false,
      }));
      await expect(service.lookup("NRA-2609-7QK2M4D")).resolves.toEqual({
        kind: "untracked",
        reference: "NRA-2609-7QK2M4D",
        receivedAt: "2026-09-12T14:04:00.000Z",
        formId: "apply-for-a-thing",
      });
    });
  });

  // An outage, never a guess: the chat shows "We cannot check your
  // application right now", with Try again.
  describe("when the tracker can't answer", () => {
    it("is unavailable, and logs why without the reference", async () => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      const { service } = makeService(SUBMITTED, camsRecipe, async () => {
        throw new TrackerLookupError("http_403");
      });

      await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0]?.[0]);
      expect(logged).toContain("http_403");
      expect(logged).not.toContain("NRA-2609-7QK2M4D");
      warn.mockRestore();
    });

    it("is unavailable for a deleted recipe too", async () => {
      vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      const { service } = makeService(SUBMITTED, deletedRecipe, async () => {
        throw new TrackerLookupError("timeout");
      });
      await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      vi.restoreAllMocks();
    });
  });

  it("lets any other recipe failure through", async () => {
    const boom = new Error("database down");
    const { service } = makeService(SUBMITTED, async () => {
      throw boom;
    });
    await expect(service.lookup("NRA-2609-7QK2M4D")).rejects.toBe(boom);
  });
});
