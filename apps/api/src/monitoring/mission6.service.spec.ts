import { Mission6Service } from "./mission6.service";

const query = vi.fn();
const findAll = vi.fn();

const service = () =>
  new Mission6Service({ query } as never, { findAll } as never);

const citizen = { "you.email": "a.person@gmail.com" };
const team = { "you.email": "dev@govtech.bb" };

describe("Mission6Service.report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_APPLICANT_EMAILS;
    findAll.mockResolvedValue([{ formId: "form-a", title: "Apply for A" }]);
  });

  it("counts applications and payments by service and month, tests left out", async () => {
    query
      .mockResolvedValueOnce([
        { formId: "form-a", month: "2026-10", identity: citizen },
        { formId: "form-a", month: "2026-10", identity: citizen },
        { formId: "form-a", month: "2026-10", identity: team },
        { formId: "form-a", month: "2026-11", identity: null },
      ])
      .mockResolvedValueOnce([
        {
          formId: "form-a",
          month: "2026-10",
          amount: "10.10",
          identity: citizen,
        },
        {
          formId: "form-a",
          month: "2026-10",
          amount: "20.20",
          identity: citizen,
        },
        { formId: "form-a", month: "2026-10", amount: "99.00", identity: team },
      ]);

    const r = await service().report();

    expect(r.applications).toEqual([
      {
        formId: "form-a",
        month: "2026-10",
        applications: 2,
        leftOutAsTests: 1,
      },
      {
        formId: "form-a",
        month: "2026-11",
        applications: 1,
        leftOutAsTests: 0,
      },
    ]);
    expect(r.payments).toEqual([
      {
        formId: "form-a",
        month: "2026-10",
        payments: 2,
        amountBbd: 30.3,
        leftOutAsTests: 1,
      },
    ]);
    expect(r.services).toEqual({ "form-a": "Apply for A" });
  });

  it("applies the named inboxes from TEST_APPLICANT_EMAILS", async () => {
    process.env.TEST_APPLICANT_EMAILS = "A.Person@gmail.com";
    query
      .mockResolvedValueOnce([
        { formId: "form-a", month: "2026-10", identity: citizen },
      ])
      .mockResolvedValueOnce([]);

    const r = await service().report();

    expect(r.applications[0]).toMatchObject({
      applications: 0,
      leftOutAsTests: 1,
    });
  });

  it("falls back to the form id for a form with no definition (retired)", async () => {
    query
      .mockResolvedValueOnce([
        { formId: "retired-form", month: "2026-07", identity: citizen },
      ])
      .mockResolvedValueOnce([]);

    const r = await service().report();

    expect(r.services).toEqual({ "retired-form": "retired-form" });
  });
});
