/**
 * forms.spec.ts
 *
 * Unit tests for the fetch-based API functions and the pure
 * formatDataForSubmission helper in lib/api/forms.ts.
 *
 * Coverage:
 *  - FormFetchError: class shape (name, status)
 *  - fetchFormDefinition: success, network error, non-ok response, invalid schema body
 *  - fetchFormDefinitions: success path
 *  - fetchFormDraft: success path, parse failure
 *  - patchFormDraft: success path, parse failure
 *  - deleteFormDraft: success path returns status code
 *  - postFormSubmission: success path, response parse failure
 *  - formatDataForSubmission: hidden fields, empty values, non-repeatable grouping,
 *    repeatable collapsing, addAnother stripping, stepData fallback
 */

import {
  FormFetchError,
  fetchFormDefinition,
  fetchFormDefinitions,
  fetchFormDraft,
  patchFormDraft,
  deleteFormDraft,
  postFormSubmission,
  formatDataForSubmission,
} from "./forms";
import type {
  FormValues,
  RepeatableStepSettings,
  ClientPrimitive,
  FormMeta,
} from "@forms/types";

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
});

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

/** Minimal valid ServiceContract shape that passes serviceContractSchema */
const minimalServiceContract = {
  formId: "test-form",
  title: "Test Form",
  version: "1.0.0",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  steps: [],
};

/** Minimal valid FormDraftResponseBody shape */
const minimalDraftBody = {
  id: "draft-uuid",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  draftId: "draft-123",
  formId: "test-form",
  formVersion: "1.0.0",
  values: {},
  lastActiveStep: "step1",
  status: "draft",
  lastActiveAt: "2024-01-01T00:00:00.000Z",
};

/** Minimal valid FormSubmissionResponseBody shape */
const minimalSubmissionBody = {
  id: "sub-uuid",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  idempotencyKey: "idem-key-1",
  formId: "test-form",
  formVersion: "1.0.0",
  status: "submitted",
  values: {},
  meta: null,
  submittedAt: "2024-01-01T00:00:00.000Z",
};

function makeOkResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => ({ status: "success", message: "ok", data }),
  } as unknown as Response;
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ status: "failed", message: "not found", data: null }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// FormFetchError
// ---------------------------------------------------------------------------

describe("FormFetchError", () => {
  it("is constructable with a message and status", () => {
    const err = new FormFetchError("Something went wrong", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FormFetchError);
  });

  it("has name 'FormFetchError'", () => {
    const err = new FormFetchError("oops", 500);
    expect(err.name).toBe("FormFetchError");
  });

  it("exposes the HTTP status on .status", () => {
    const err = new FormFetchError("Not found", 404);
    expect(err.status).toBe(404);
  });

  it("exposes the message via .message", () => {
    const err = new FormFetchError("Custom message", 400);
    expect(err.message).toBe("Custom message");
  });

  it("status 0 is used for network errors", () => {
    const err = new FormFetchError("Network error", 0);
    expect(err.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchFormDefinition
// ---------------------------------------------------------------------------

describe("fetchFormDefinition", () => {
  it("returns a parsed ServiceContract on success", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalServiceContract));
    const result = await fetchFormDefinition("test-form");
    expect(result.formId).toBe("test-form");
    expect(result.version).toBe("1.0.0");
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("calls fetch with the correct URL", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalServiceContract));
    await fetchFormDefinition("my-contract");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/form-definitions/my-contract");
  });

  it("throws FormFetchError with status 0 when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchFormDefinition("test-form")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 0,
    });
  });

  it("throws FormFetchError when response is not ok (404)", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(404));
    await expect(fetchFormDefinition("missing-form")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 404,
      // The per-endpoint not_found message must surface to callers.
      // Currently RED: forms.ts:69-74 has `case 404:` falling through to `default:`
      // because of a missing `break`, so the default "Failed to load form ..."
      // message clobbers the per-endpoint copy. Source fix tracked separately.
      message: 'The form "missing-form" could not be found.',
    });
  });

  it("throws FormFetchError with status 400 when response body fails schema parse", async () => {
    // Return a valid HTTP 200 but with an object that does NOT satisfy serviceContractSchema
    mockFetch.mockResolvedValue(makeOkResponse({ invalid: true }));
    await expect(fetchFormDefinition("bad-form")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 400,
    });
  });

  it("encodes special characters in the contractId", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalServiceContract));
    await fetchFormDefinition("my form/id");
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("my%20form%2Fid");
  });

  it("sends X-Recipe-Preview header when preview token is provided", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalServiceContract));
    await fetchFormDefinition("passport-renewal", "s3cret");
    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    expect(
      (fetchOptions.headers as Record<string, string>)["X-Recipe-Preview"],
    ).toBe("s3cret");
  });

  it("does NOT send X-Recipe-Preview header when no preview token is provided", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalServiceContract));
    await fetchFormDefinition("passport-renewal");
    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = fetchOptions?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Recipe-Preview"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchFormDefinitions
// ---------------------------------------------------------------------------

describe("fetchFormDefinitions", () => {
  it("returns an array of FormDefinitionSummary objects on success", async () => {
    const data = [
      { formId: "form-1", title: "Form One" },
      { formId: "form-2", title: "Form Two" },
    ];
    mockFetch.mockResolvedValue(makeOkResponse(data));
    const result = await fetchFormDefinitions();
    expect(result).toHaveLength(2);
    expect(result[0].formId).toBe("form-1");
    expect(result[1].title).toBe("Form Two");
  });

  it("calls fetch with the /form-definitions endpoint", async () => {
    mockFetch.mockResolvedValue(makeOkResponse([]));
    await fetchFormDefinitions();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/form-definitions");
  });
});

// ---------------------------------------------------------------------------
// fetchFormDraft
// ---------------------------------------------------------------------------

describe("fetchFormDraft", () => {
  it("returns a parsed FormDraftResponseBody on success", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalDraftBody));
    const result = await fetchFormDraft("draft-123");
    expect(result.draftId).toBe("draft-123");
    expect(result.formId).toBe("test-form");
    expect(result.status).toBe("draft");
  });

  it("calls fetch with the correct draft URL", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalDraftBody));
    await fetchFormDraft("my-draft");
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/form-drafts/my-draft");
  });

  it("throws FormFetchError with status 400 when response body fails schema validation", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ not: "a draft" }));
    await expect(fetchFormDraft("bad-draft")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 400,
    });
  });

  it("throws FormFetchError with status 0 when network fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));
    await expect(fetchFormDraft("any")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// patchFormDraft
// ---------------------------------------------------------------------------

describe("patchFormDraft", () => {
  it("returns a parsed FormDraftResponseBody on success", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalDraftBody));
    const result = await patchFormDraft("draft-123", {
      lastActiveStep: "step2",
    });
    expect(result.draftId).toBe("draft-123");
    expect(result.lastActiveStep).toBe("step1"); // from the fixture
  });

  it("calls fetch with PATCH method, the correct URL, and the caller's patch as the JSON body", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalDraftBody));
    await patchFormDraft("draft-123", { lastActiveStep: "step2" });
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const fetchArgs = mockFetch.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain("/form-drafts/draft-123");
    expect(fetchArgs.method).toBe("PATCH");
    expect(fetchArgs.body).toBe(JSON.stringify({ lastActiveStep: "step2" }));
  });

  it("throws FormFetchError with status 400 when schema parse fails", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ unexpected: true }));
    await expect(
      patchFormDraft("draft-123", { lastActiveStep: "step2" }),
    ).rejects.toMatchObject({
      name: "FormFetchError",
      status: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// deleteFormDraft
// ---------------------------------------------------------------------------

describe("deleteFormDraft", () => {
  it("returns the HTTP status code on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({ status: "success", message: "deleted", data: null }),
    } as unknown as Response);
    const status = await deleteFormDraft("draft-to-delete");
    expect(status).toBe(204);
  });

  it("calls fetch with DELETE method against the correct /form-drafts/:id URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "success", message: "ok", data: null }),
    } as unknown as Response);
    await deleteFormDraft("draft-123");
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const fetchArgs = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchArgs.method).toBe("DELETE");
    // Currently RED: forms.ts:200 has typo `/form-drafs/${draftId}` (missing 't').
    // Source fix tracked separately.
    expect(calledUrl).toContain("/form-drafts/draft-123");
  });
});

// ---------------------------------------------------------------------------
// postFormSubmission
// ---------------------------------------------------------------------------

const minimalFormMeta: Pick<FormMeta, "formId" | "version" | "idempotencyKey"> =
  {
    formId: "test-form",
    version: "1.0.0",
    idempotencyKey: "unique-key-abc",
  };

describe("postFormSubmission", () => {
  it("returns the response body on success", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalSubmissionBody));
    const result = await postFormSubmission(minimalFormMeta as FormMeta, {});
    expect(result).toBeDefined();
    expect(result?.data).toMatchObject({ formId: "test-form" });
  });

  // Regression for #606: a successful submission whose `values` contain
  // repeatable-step arrays and file-upload objects must NOT make
  // postFormSubmission throw. The client never reads these values back from the
  // response (the confirmation needs only id/submittedAt/formId), and the real
  // shape is sanctioned by FormValuesByStep (Record<stepId, FormValues |
  // Array<FormValues>>). Over-strict parsing here caused the submit flow to
  // bounce off the confirmation screen back to check-your-answers.
  it("accepts repeatable-step arrays and file-upload objects in values (#606)", async () => {
    const bodyWithRichValues = {
      ...minimalSubmissionBody,
      values: {
        "personal-data": {
          firstName: "Edgardo",
          dateOfBirth: { day: 15, month: 6, year: 1990 },
        },
        "educational-record": [
          {
            institution: "UWI",
            country: "Barbados",
            from: "2008",
            to: "2012",
          },
        ],
        "upload-documents": {
          certificatesUpload: [
            {
              key: "uploads/x.png",
              name: "x.png",
              size: 69,
              type: "image/png",
            },
          ],
        },
      },
    };
    mockFetch.mockResolvedValue(makeOkResponse(bodyWithRichValues));
    const result = await postFormSubmission(minimalFormMeta as FormMeta, {});
    expect(result?.data).toMatchObject({ formId: "test-form" });
  });

  it("sends a POST request with the idempotency-key header, correct URL, and {formId, formVersion, values} body", async () => {
    mockFetch.mockResolvedValue(makeOkResponse(minimalSubmissionBody));
    const valuesBySteps = {
      step1: { firstName: "Alice" },
      step2: { email: "alice@example.com" },
    };
    await postFormSubmission(minimalFormMeta as FormMeta, valuesBySteps);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const fetchArgs = mockFetch.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toContain("/submissions");
    expect(fetchArgs.method).toBe("POST");
    expect(
      (fetchArgs.headers as Record<string, string>)["idempotency-key"],
    ).toBe("unique-key-abc");
    expect(JSON.parse(fetchArgs.body as string)).toEqual({
      formId: "test-form",
      formVersion: "1.0.0",
      values: valuesBySteps,
    });
  });

  it("throws FormFetchError with status 400 when submission response schema fails", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ bad: "data" }));
    await expect(
      postFormSubmission(minimalFormMeta as FormMeta, {}),
    ).rejects.toMatchObject({
      name: "FormFetchError",
      status: 400,
    });
  });

  it("throws FormFetchError with status 0 when network fails", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));
    await expect(
      postFormSubmission(minimalFormMeta as FormMeta, {}),
    ).rejects.toMatchObject({
      name: "FormFetchError",
      status: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// makeFetch — body.status failure path
// ---------------------------------------------------------------------------

describe("makeFetch body.status failure path", () => {
  it("throws FormFetchError when body.status is 'failed'", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "failed",
        message: "Something went wrong on the server.",
        data: null,
      }),
    } as unknown as Response);
    await expect(fetchFormDefinitions()).rejects.toMatchObject({
      name: "FormFetchError",
      status: 500,
      message: "Something went wrong on the server.",
    });
  });

  it("uses fallback message when body.status is failed and message is absent", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "failed",
        data: null,
      }),
    } as unknown as Response);
    await expect(fetchFormDefinitions()).rejects.toMatchObject({
      name: "FormFetchError",
      message: "The server returned an unexpected response.",
    });
  });
});

// ---------------------------------------------------------------------------
// formatDataForSubmission
// ---------------------------------------------------------------------------

describe("formatDataForSubmission", () => {
  // Helper to build a minimal ClientPrimitive for a hidden field
  function makeHiddenField(id: string): ClientPrimitive {
    return {
      id,
      fieldId: id.split("_")[1] ?? id,
      stepId: id.split("_")[0] ?? "step1",
      name: id,
      label: id,
      htmlType: "text",
      disabled: false,
      hidden: false,
      conditionallyHidden: true,
    } as ClientPrimitive;
  }

  const emptyRepeatableSettings: RepeatableStepSettings = {};

  // ---- 1. Hidden fields removal ------------------------------------------

  describe("hidden fields removal", () => {
    it("strips fields listed in hiddenFields from the output", () => {
      const values: FormValues = {
        step1_name: "Alice",
        step1_secret: "hidden-value",
      };
      const hiddenFields = [makeHiddenField("step1_secret")];

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        hiddenFields,
      );

      expect(result.step1).toBeDefined();
      expect((result.step1 as FormValues).name).toBe("Alice");
      expect((result.step1 as FormValues).secret).toBeUndefined();
    });

    it("leaves visible fields intact when some fields are hidden", () => {
      const values: FormValues = {
        step1_firstName: "Bob",
        step1_hiddenField: "gone",
      };
      const hiddenFields = [makeHiddenField("step1_hiddenField")];

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        hiddenFields,
      );

      expect((result.step1 as FormValues).firstName).toBe("Bob");
    });

    it("returns an empty result when all fields are hidden", () => {
      const values: FormValues = { step1_a: "x", step1_b: "y" };
      const hiddenFields = [
        makeHiddenField("step1_a"),
        makeHiddenField("step1_b"),
      ];

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        hiddenFields,
      );

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  // ---- 2. Empty values stripped ------------------------------------------

  describe("empty values stripping", () => {
    it("strips fields with empty string values", () => {
      const values: FormValues = { step1_name: "Alice", step1_middle: "" };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect((result.step1 as FormValues).name).toBe("Alice");
      expect((result.step1 as FormValues).middle).toBeUndefined();
    });

    it("strips fields with undefined values", () => {
      const values: FormValues = {
        step1_name: "Alice",
        step1_age: undefined as unknown as string,
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect((result.step1 as FormValues).age).toBeUndefined();
    });

    it("strips fields with empty array values", () => {
      const values: FormValues = { step1_tags: [] as unknown as string };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect(result.step1).toBeUndefined();
    });

    it("keeps fields with numeric 0 values (do not treat 0 as empty)", () => {
      const values: FormValues = {
        step1_dependents: 0 as unknown as string,
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect((result.step1 as FormValues).dependents).toBe(0);
    });

    it("keeps fields with boolean false values (do not treat false as empty)", () => {
      const values: FormValues = {
        step1_accepted: false as unknown as string,
        step1_name: "Bob",
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect((result.step1 as FormValues).accepted).toBe(false);
      expect((result.step1 as FormValues).name).toBe("Bob");
    });

    it("keeps fields with boolean true values", () => {
      const values: FormValues = {
        step1_consent: true as unknown as string,
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect((result.step1 as FormValues).consent).toBe(true);
    });
  });

  // ---- 3. Non-repeatable grouping ----------------------------------------

  describe("non-repeatable step grouping", () => {
    it("groups step1_firstName and step1_lastName under the 'step1' key", () => {
      const values: FormValues = {
        step1_firstName: "John",
        step1_lastName: "Doe",
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect(result.step1).toEqual({ firstName: "John", lastName: "Doe" });
    });

    it("groups fields from multiple steps independently", () => {
      const values: FormValues = {
        step1_firstName: "Jane",
        step2_email: "jane@example.com",
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect(result.step1).toEqual({ firstName: "Jane" });
      expect(result.step2).toEqual({ email: "jane@example.com" });
    });

    it("strips the step prefix, leaving only the field id as the key", () => {
      const values: FormValues = { personalInfo_dob: "1990-01-01" };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect(result.personalInfo).toEqual({ dob: "1990-01-01" });
    });
  });

  // ---- 4. Repeatable step collapsing -------------------------------------

  describe("repeatable step collapsing", () => {
    it("collapses personalInfo and personalInfo~1 into an array under 'personalInfo'", () => {
      const values: FormValues = {
        personalInfo_name: "Alice",
        "personalInfo~1_name": "Bob",
      };

      const repeatableSettings: RepeatableStepSettings = {
        personalInfo: {
          minRepeats: 1,
          maxRepeats: 5,
          orderedStepIds: ["personalInfo", "personalInfo~1"],
          stepData: {
            personalInfo: { personalInfo_name: "Alice" },
            "personalInfo~1": { "personalInfo~1_name": "Bob" },
          },
        },
      };

      const result = formatDataForSubmission(values, repeatableSettings, []);

      expect(Array.isArray(result.personalInfo)).toBe(true);
      const instances = result.personalInfo as FormValues[];
      expect(instances).toHaveLength(2);
      expect(instances[0].name).toBe("Alice");
      expect(instances[1].name).toBe("Bob");
    });

    it("stops collapsing when an orderedStepId has no visible values", () => {
      // Only the first repeat has values — the second is empty/hidden
      const values: FormValues = {
        personalInfo_name: "Alice",
      };

      const repeatableSettings: RepeatableStepSettings = {
        personalInfo: {
          minRepeats: 1,
          maxRepeats: 5,
          orderedStepIds: ["personalInfo", "personalInfo~1"],
          stepData: {
            personalInfo: { personalInfo_name: "Alice" },
            "personalInfo~1": {},
          },
        },
      };

      const result = formatDataForSubmission(values, repeatableSettings, []);

      const instances = result.personalInfo as FormValues[];
      // First instance is included; the loop must `break` at personalInfo~1
      // because there are no visible values for it. This pins the `break`
      // behaviour at forms.ts (do not emit an empty trailing instance).
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe("Alice");
    });
  });

  // ---- 5. addAnother stripped from repeatable instances ------------------

  describe("addAnother stripping", () => {
    it("removes addAnother from each repeatable instance", () => {
      const values: FormValues = {
        personalInfo_name: "Alice",
        personalInfo_addAnother: "yes",
      };

      const repeatableSettings: RepeatableStepSettings = {
        personalInfo: {
          minRepeats: 1,
          maxRepeats: 5,
          orderedStepIds: ["personalInfo"],
          stepData: {
            personalInfo: {
              personalInfo_name: "Alice",
              personalInfo_addAnother: "yes",
            },
          },
        },
      };

      const result = formatDataForSubmission(values, repeatableSettings, []);

      const instances = result.personalInfo as FormValues[];
      expect(instances[0].addAnother).toBeUndefined();
      expect(instances[0].name).toBe("Alice");
    });
  });

  // ---- 6. stepData fallback (empty stepData) -----------------------------

  describe("stepData fallback", () => {
    it("derives field values from flat form values when stepData is empty", () => {
      const values: FormValues = {
        personalInfo_name: "Charlie",
        personalInfo_email: "charlie@example.com",
      };

      const repeatableSettings: RepeatableStepSettings = {
        personalInfo: {
          minRepeats: 1,
          maxRepeats: 5,
          orderedStepIds: ["personalInfo"],
          // stepData is empty — triggers the fallback branch
          stepData: {
            personalInfo: {},
          },
        },
      };

      const result = formatDataForSubmission(values, repeatableSettings, []);

      const instances = result.personalInfo as FormValues[];
      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe("Charlie");
      expect(instances[0].email).toBe("charlie@example.com");
    });
  });

  // ---- 7. sharedData merged into each instance --------------------------

  describe("sharedData merging", () => {
    it("spreads sharedData into each repeatable instance", () => {
      const values: FormValues = {
        personalInfo_name: "Alice",
      };

      const sharedData: FormValues = { country: "Barbados" };

      const repeatableSettings: RepeatableStepSettings = {
        personalInfo: {
          minRepeats: 1,
          maxRepeats: 5,
          orderedStepIds: ["personalInfo"],
          stepData: {
            personalInfo: { personalInfo_name: "Alice" },
          },
          sharedData,
        },
      };

      const result = formatDataForSubmission(values, repeatableSettings, []);

      const instances = result.personalInfo as FormValues[];
      expect(instances[0].country).toBe("Barbados");
      expect(instances[0].name).toBe("Alice");
    });
  });

  // ---- 8. No hidden fields, no repeatable settings, no values ------------

  describe("edge cases", () => {
    it("returns empty object when values is empty", () => {
      const result = formatDataForSubmission({}, emptyRepeatableSettings, []);
      expect(result).toEqual({});
    });

    it("handles multiple fields from the same step correctly", () => {
      const values: FormValues = {
        addressStep_line1: "123 Main St",
        addressStep_city: "Bridgetown",
        addressStep_country: "Barbados",
      };

      const result = formatDataForSubmission(
        values,
        emptyRepeatableSettings,
        [],
      );

      expect(result.addressStep).toEqual({
        line1: "123 Main St",
        city: "Bridgetown",
        country: "Barbados",
      });
    });
  });
});
