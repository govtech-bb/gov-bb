/**
 * form-fetcher.spec.ts
 *
 * Unit tests for fetchContract, which dispatches to either the bundled master
 * contract or the live API depending on the supplied id.
 *
 * Coverage:
 *  - fetchContract("master") returns a ClientServiceContract
 *  - fetchContract(<real-id>) delegates to fetchFormDefinition and maps result
 *  - fetchContract(<real-id>) propagates errors thrown by fetchFormDefinition
 */

// Mock the @forms/form-api module before any imports that depend on it.
jest.mock("@forms/form-api", () => ({
  fetchFormDefinition: jest.fn(),
}));

import { fetchContract } from "./form-fetcher";
import { fetchFormDefinition } from "@forms/form-api";
import type { ClientServiceContract } from "@forms/types";

const mockFetchFormDefinition = fetchFormDefinition as jest.Mock;

// ---------------------------------------------------------------------------
// Minimal ServiceContract fixture that satisfies serviceContractSchema
// ---------------------------------------------------------------------------

const minimalContract = {
  formId: "test-form",
  title: "Test Form",
  version: "1.0.0",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  steps: [],
};

// ---------------------------------------------------------------------------
// fetchContract("master") — uses bundled master contract
// ---------------------------------------------------------------------------

describe('fetchContract("master")', () => {
  it("returns a ClientServiceContract with a steps array", async () => {
    const result: ClientServiceContract = await fetchContract("master");
    expect(result).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("returns an object with a formId string", async () => {
    const result = await fetchContract("master");
    expect(typeof result.formId).toBe("string");
    expect(result.formId.length).toBeGreaterThan(0);
  });

  it("does NOT call fetchFormDefinition for the 'master' id", async () => {
    mockFetchFormDefinition.mockClear();
    await fetchContract("master");
    expect(mockFetchFormDefinition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchContract(<real-id>) — delegates to fetchFormDefinition
// ---------------------------------------------------------------------------

describe("fetchContract(<real-id>)", () => {
  beforeEach(() => {
    mockFetchFormDefinition.mockClear();
  });

  it("calls fetchFormDefinition with the supplied id", async () => {
    mockFetchFormDefinition.mockResolvedValue(minimalContract);
    await fetchContract("some-real-id");
    expect(mockFetchFormDefinition).toHaveBeenCalledTimes(1);
    expect(mockFetchFormDefinition).toHaveBeenCalledWith("some-real-id");
  });

  it("returns a ClientServiceContract mapped from the API response", async () => {
    mockFetchFormDefinition.mockResolvedValue(minimalContract);
    const result = await fetchContract("some-real-id");
    expect(result).toBeDefined();
    expect(result.formId).toBe("test-form");
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("propagates errors thrown by fetchFormDefinition", async () => {
    const apiError = new Error("Network failure");
    mockFetchFormDefinition.mockRejectedValue(apiError);

    await expect(fetchContract("some-real-id")).rejects.toThrow(
      "Network failure",
    );
  });

  it("propagates FormFetchError thrown by fetchFormDefinition", async () => {
    // Simulate the FormFetchError that the real fetchFormDefinition would throw on a 404.
    const fetchError = Object.assign(new Error("Form not found"), {
      name: "FormFetchError",
      status: 404,
    });
    mockFetchFormDefinition.mockRejectedValue(fetchError);

    await expect(fetchContract("missing-form")).rejects.toMatchObject({
      name: "FormFetchError",
      status: 404,
    });
  });
});
