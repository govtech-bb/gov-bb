import type { Mock } from "vitest";
import type { Request, Response } from "express";

// The handlers import MdaContactEntity from @govtech-bb/database. Stub it so
// loading the module doesn't drag in the full TypeORM entity graph.
vi.mock("@govtech-bb/database", () => ({
  MdaContactEntity: class MdaContactEntity {},
  FormConfigEntity: class FormConfigEntity {},
}));

vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));

import { getDataSource } from "../db.js";
import { HttpError } from "../lib/http-error";
import {
  listMdaContactsHandler,
  createMdaContactHandler,
} from "./mda-contacts";

const getDataSourceMock = getDataSource as Mock;

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
}

interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

function fakeDataSource(rows: { find?: unknown[]; created?: unknown } = {}) {
  const { find = [], created = null } = rows;
  const save = vi.fn(async (e: unknown) => created ?? e);
  const repo = {
    find: vi.fn(async () => find),
    create: vi.fn((e: unknown) => e),
    save,
  };
  const ds = { getRepository: vi.fn(() => repo) };
  return { ds, repo, save };
}

function validBody(over: Record<string, unknown> = {}) {
  return {
    label: "Registry Dept",
    title: "Registration Department",
    telephone: "246-555-0100",
    email: "public@registry.gov.bb",
    mdaEmail: "notify@registry.gov.bb",
    ...over,
  };
}

describe("listMdaContactsHandler", () => {
  it("returns 200 with the directory of contacts (including mdaEmail)", async () => {
    const contacts = [
      {
        id: "c1",
        label: "Registry Dept",
        title: "Registration Department",
        telephone: "246-555-0100",
        email: "public@registry.gov.bb",
        address: { line1: "1 Main St", city: "Bridgetown" },
        mdaEmail: "notify@registry.gov.bb",
      },
    ];
    const { ds, repo } = fakeDataSource({ find: contacts });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await listMdaContactsHandler(mockReq({}), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(contacts);
    expect(repo.find).toHaveBeenCalled();
  });

  it("propagates a DB error (the central handler maps it to 500)", async () => {
    getDataSourceMock.mockRejectedValue(new Error("db down"));
    await expect(
      listMdaContactsHandler(mockReq({}), mockRes()),
    ).rejects.toThrow("db down");
  });
});

describe("createMdaContactHandler", () => {
  it("creates a contact and returns 201 with the full record", async () => {
    const createdRecord = {
      id: "new-id",
      ...validBody(),
      address: null,
    };
    const { ds, repo, save } = fakeDataSource({ created: createdRecord });
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createMdaContactHandler(mockReq(validBody()), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(createdRecord);
    expect(repo.create).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it("accepts an optional address object", async () => {
    const body = validBody({
      address: { line1: "1 Main St", city: "Bridgetown" },
    });
    const { ds, repo } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const res = mockRes();
    await createMdaContactHandler(mockReq(body), res);

    expect(res.statusCode).toBe(201);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        address: { line1: "1 Main St", city: "Bridgetown" },
      }),
    );
  });

  it("throws a 400 HttpError for a body missing a required field", async () => {
    const { ds } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const { mdaEmail, ...incomplete } = validBody();
    const err = await createMdaContactHandler(
      mockReq(incomplete),
      mockRes(),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((err as HttpError).message).toBeTruthy();
  });

  it("throws a 400 HttpError for a non-email email field", async () => {
    const { ds } = fakeDataSource();
    getDataSourceMock.mockResolvedValue(ds);

    const err = await createMdaContactHandler(
      mockReq(validBody({ email: "not-an-email" })),
      mockRes(),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });

  it("propagates a DB error (the central handler maps it to 500)", async () => {
    const { ds, repo } = fakeDataSource();
    repo.save.mockRejectedValue(new Error("insert failed"));
    getDataSourceMock.mockResolvedValue(ds);

    await expect(
      createMdaContactHandler(mockReq(validBody()), mockRes()),
    ).rejects.toThrow("insert failed");
  });
});
