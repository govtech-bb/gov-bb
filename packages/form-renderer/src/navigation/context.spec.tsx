import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { FormNavigationProvider, useFormNavigation } from "./context";
import type { FormNavigation } from "./context";

describe("FormNavigation context", () => {
  it("provides the injected navigation", () => {
    const nav: FormNavigation = { goToStep: vi.fn() };
    const { result } = renderHook(() => useFormNavigation(), {
      wrapper: ({ children }) => (
        <FormNavigationProvider navigation={nav}>
          {children}
        </FormNavigationProvider>
      ),
    });
    result.current.goToStep("step-2");
    expect(nav.goToStep).toHaveBeenCalledWith("step-2");
  });

  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useFormNavigation())).toThrow(
      /useFormNavigation must be used within a FormNavigationProvider/,
    );
  });
});
