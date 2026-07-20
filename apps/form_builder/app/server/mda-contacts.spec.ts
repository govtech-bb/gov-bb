import type { Mock } from "vitest";
/**
 * @vitest-environment node
 */
import type { MdaContact } from "../types/index";

// Mock the auth surface before importing the SUT — mirrors forms.spec.ts.
vi.mock("./session-cipher.server", () => ({
  getSession: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
vi.mock("./api-client", () => {
  const ApiError = class extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  };
  return {
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
    ApiError,
  };
});

import { getSession } from "./session-cipher.server";
import { api } from "./api-client";
import { listMdaContacts, createMdaContact } from "./mda-contacts";

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

const apiGet = api.get as Mock;
const apiPost = api.post as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  (getSession as Mock).mockReturnValue(SESSION);
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

const CONTACT: MdaContact = {
  id: "contact-1",
  label: "Ministry of Health",
  title: "Ministry of Health",
  telephone: "(246) 535-8300",
  email: "health@gov.bb",
  address: { line1: "Jemmotts Lane", city: "Bridgetown" },
  mdaEmail: "notify@health.gov.bb",
};

describe("listMdaContacts", () => {
  it("fetches the MDA contact directory from the API", async () => {
    apiGet.mockResolvedValue([CONTACT]);

    const result = await listMdaContacts();

    expect(apiGet).toHaveBeenCalledWith("/builder/mda-contacts");
    expect(result).toEqual([CONTACT]);
  });
});

describe("createMdaContact", () => {
  it("posts the new contact body and returns the created row", async () => {
    apiPost.mockResolvedValue(CONTACT);
    const body = {
      label: "Ministry of Health",
      title: "Ministry of Health",
      telephone: "(246) 535-8300",
      email: "health@gov.bb",
      address: { line1: "Jemmotts Lane", city: "Bridgetown" },
      mdaEmail: "notify@health.gov.bb",
    };

    const result = await createMdaContact({
      data: body,
      context: { session: SESSION },
    } as never);

    expect(apiPost).toHaveBeenCalledWith("/builder/mda-contacts", body);
    expect(result).toEqual(CONTACT);
  });

  it("accepts a contact without an address", async () => {
    apiPost.mockResolvedValue({ ...CONTACT, address: null });
    const body = {
      label: "Email-only MDA",
      title: "Email-only MDA",
      telephone: "(246) 000-0000",
      email: "a@gov.bb",
      mdaEmail: "notify@gov.bb",
    };

    await createMdaContact({
      data: body,
      context: { session: SESSION },
    } as never);

    expect(apiPost).toHaveBeenCalledWith("/builder/mda-contacts", body);
  });
});

describe("getFormConfig", () => {
  it("reads the per-environment config for a form", async () => {
    const { getFormConfig } = await import("./forms");
    apiGet.mockResolvedValue({ mdaContactId: "contact-1" });

    const result = await getFormConfig({
      data: { formId: "birth-registration" },
      context: { session: SESSION },
    } as never);

    expect(apiGet).toHaveBeenCalledWith(
      "/builder/forms/birth-registration/config",
    );
    expect(result).toEqual({ mdaContactId: "contact-1" });
  });
});
