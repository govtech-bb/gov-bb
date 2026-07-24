import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { FormTransportProvider, useFormTransport } from "./context";
import type { FormTransport } from "./types";

const stub: FormTransport = {
  submit: async () => ({}) as never,
  uploadFile: async () => ({}) as never,
};

describe("FormTransport context", () => {
  it("provides the injected transport", () => {
    const { result } = renderHook(() => useFormTransport(), {
      wrapper: ({ children }) => (
        <FormTransportProvider transport={stub}>
          {children}
        </FormTransportProvider>
      ),
    });
    expect(result.current).toBe(stub);
  });

  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useFormTransport())).toThrow(
      /useFormTransport must be used within a FormTransportProvider/,
    );
  });
});
