import { of } from "rxjs";
import { lastValueFrom } from "rxjs";
import { ResponseInterceptor } from "./response.interceptor";

function makeContext(res: object) {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as never;
}

function makeHandler(data: unknown) {
  return { handle: () => of(data) } as never;
}

function makeRes() {
  const res = { statusCode: 0, status: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("ResponseInterceptor", () => {
  let interceptor: ResponseInterceptor;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it("returns the data unchanged when statusCode is absent", async () => {
    const res = makeRes();
    const data = { status: "success", data: { id: 1 } };
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(res), makeHandler(data)),
    );

    expect(result).toBe(data);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls res.status() with the statusCode when present", async () => {
    const res = makeRes();
    const data = { status: "success", data: {}, statusCode: 201 };
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(res), makeHandler(data)),
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(result).toBe(data);
  });

  it("does not call res.status() when data is null", async () => {
    const res = makeRes();
    await lastValueFrom(
      interceptor.intercept(makeContext(res), makeHandler(null)),
    );

    expect(res.status).not.toHaveBeenCalled();
  });
});
