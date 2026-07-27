import type { Mock } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldRenderer from ".";
import type { ClientPrimitive } from "@forms/types";

vi.mock("@forms/lib", () => ({
  checkConditionalOn: vi.fn().mockReturnValue("required"),
  parseDatePart: (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits === "" ? undefined : Number(digits);
  },
}));

vi.mock("../../lib/api/geocode", () => ({
  MIN_QUERY_LENGTH: 3,
  searchAddresses: vi.fn(),
}));

import { searchAddresses } from "../../lib/api/geocode";

const mockSearch = searchAddresses as Mock;

let mockState: {
  value: unknown;
  meta: { isValid: boolean; errors: unknown[] };
};
const handleChange = vi.fn((v: unknown) => {
  mockState.value = v;
});

const mockFieldApi = {
  get state() {
    return mockState;
  },
  handleBlur: vi.fn(),
  handleChange,
  validate: vi.fn(),
};

const setFieldValue = vi.fn();

const mockForm = {
  Field: ({
    children,
  }: {
    name: string;
    validators?: unknown;
    children: (f: typeof mockFieldApi) => React.ReactNode;
  }) => <>{children(mockFieldApi)}</>,
  getFieldValue: vi.fn().mockReturnValue(undefined),
  setFieldValue,
};

function addressLookupField(): ClientPrimitive {
  return {
    id: "step-1.event-address-line-1",
    fieldId: "event-address-line-1",
    stepId: "step-1",
    name: "event-address-line-1",
    label: "Event address line 1",
    htmlType: "address-lookup",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    behaviours: [],
    geocodeTargets: {
      line2FieldId: "event-address-line-2",
      parishFieldId: "event-parish",
      coordinatesFieldId: "event-address-coordinates",
    },
  } as ClientPrimitive;
}

function renderField() {
  return render(
    <FieldRenderer
      form={mockForm}
      field={addressLookupField()}
      validationProperties={{}}
    />,
  );
}

describe("AddressLookupField", () => {
  beforeEach(() => {
    mockState = { value: undefined, meta: { isValid: true, errors: [] } };
    vi.clearAllMocks();
  });

  it("renders an ARIA combobox input", () => {
    renderField();
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("shows Barbados suggestions after typing past the threshold", async () => {
    mockSearch.mockResolvedValue([
      {
        label: "Bay Street, Bridgetown, St. Michael, Barbados",
        lat: "1",
        lon: "2",
        line1: "Bay Street",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "Bay");

    const option = await screen.findByRole("option");
    expect(option.textContent).toContain("Bay Street");
    expect(mockSearch).toHaveBeenCalled();
  });

  it("commits line 1 and populates line 2, parish and coordinates on select", async () => {
    mockSearch.mockResolvedValue([
      {
        label:
          "Chefette, Prescott Boulevard, Bridgetown, St. Michael, Barbados",
        lat: "13.1",
        lon: "-59.6",
        line1: "Chefette, Prescott Boulevard",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "Che");
    const option = await screen.findByRole("option");
    await userEvent.click(option);

    // Line 1 (this field) gets the street part, not the full label.
    expect(handleChange).toHaveBeenLastCalledWith(
      "Chefette, Prescott Boulevard",
    );
    // Siblings populated via geocodeTargets (step-scoped ids).
    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-line-2",
      "Bridgetown",
    );
    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-parish",
      "st-michael",
    );
    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-coordinates",
      "13.1,-59.6",
    );
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("does not overwrite the parish when the geocoder can't resolve one", async () => {
    mockSearch.mockResolvedValue([
      {
        label: "Somewhere, Barbados",
        lat: "1",
        lon: "2",
        line1: "Somewhere",
        line2: "",
        parish: "",
      },
    ]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "Som");
    await userEvent.click(await screen.findByRole("option"));

    expect(setFieldValue).not.toHaveBeenCalledWith(
      "step-1.event-parish",
      expect.anything(),
    );
  });

  it("keeps free typing working (value tracks the input)", async () => {
    mockSearch.mockResolvedValue([]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "My own address");
    expect(handleChange).toHaveBeenLastCalledWith("My own address");
  });

  it("shows a non-blocking notice when the lookup fails", async () => {
    mockSearch.mockRejectedValue(new Error("network down"));
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "Bridgetown");

    expect(await screen.findByRole("status")).toBeTruthy();
    // Input still usable.
    expect(screen.getByRole("combobox")).toBeTruthy();
  });
});
