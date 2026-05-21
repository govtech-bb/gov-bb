jest.mock("@tanstack/react-router", () => ({
  notFound: jest.fn(() => new Error("notFound")),
}));

jest.mock("../../lib/env", () => ({
  isProdBuild: jest.fn(),
}));

import { isProdBuild } from "../../lib/env";
import { adminFormBuilderBeforeLoad } from "./form-builder.gate";

const mockIsProdBuild = isProdBuild as jest.MockedFunction<typeof isProdBuild>;

describe("admin/form-builder route gate", () => {
  beforeEach(() => {
    mockIsProdBuild.mockReset();
  });

  it("throws notFound() in a production build", () => {
    mockIsProdBuild.mockReturnValue(true);

    expect(() => adminFormBuilderBeforeLoad()).toThrow();
    expect(mockIsProdBuild).toHaveBeenCalledTimes(1);
  });

  it("returns without throwing in a development build", () => {
    mockIsProdBuild.mockReturnValue(false);

    expect(() => adminFormBuilderBeforeLoad()).not.toThrow();
    expect(mockIsProdBuild).toHaveBeenCalledTimes(1);
  });
});
