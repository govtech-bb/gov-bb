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

// Leaflet needs a real layout engine; stand the map in with a button that
// places the pin the way a drag, tap or arrow key would.
vi.mock("./location-pin-map", () => ({
  default: ({ onChange }: { onChange: (lat: number, lon: number) => void }) => (
    <button type="button" onClick={() => onChange(13.1, -59.6)}>
      Place pin
    </button>
  ),
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

function addressLookupField(
  geocodeTargets: ClientPrimitive["geocodeTargets"] = {
    line2FieldId: "event-address-line-2",
    parishFieldId: "event-parish",
    coordinatesFieldId: "event-address-coordinates",
  },
): ClientPrimitive {
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
    geocodeTargets,
  } as ClientPrimitive;
}

function renderField(field = addressLookupField()) {
  return render(
    <FieldRenderer form={mockForm} field={field} validationProperties={{}} />,
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

  it("selects a suggestion with the keyboard and populates its coordinates", async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue([
      {
        label: "Bay Street, Bridgetown, St. Michael, Barbados",
        lat: "13.1",
        lon: "-59.6",
        line1: "Bay Street",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    renderField();

    const input = screen.getByRole("combobox");
    await user.type(input, "Bay");
    const option = await screen.findByRole("option");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await user.keyboard("{Enter}");

    expect(input).toHaveValue("Bay Street");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(handleChange).toHaveBeenLastCalledWith("Bay Street");
    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-coordinates",
      "13.1,-59.6",
    );
  });

  it("keeps free typing working (value tracks the input)", async () => {
    mockSearch.mockResolvedValue([]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "My own address");
    expect(handleChange).toHaveBeenLastCalledWith("My own address");
  });

  // Picking a suggestion writes the routing coordinate, then editing the address
  // by hand used to leave it behind — so the CMS received a precise coordinate
  // for an address the applicant had already replaced, and catchment routing
  // sent the application to the polyclinic serving the OLD address.
  it("clears the geocoded coordinate when the address is edited by hand", async () => {
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
    await userEvent.click(await screen.findByRole("option"));
    setFieldValue.mockClear();

    await userEvent.type(screen.getByRole("combobox"), "X");

    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-coordinates",
      "",
    );
  });

  // The parish is the routing fallback the server fills the coordinate from, and
  // it is a field the applicant can see and correct — so it survives an edit.
  it("leaves the parish alone when the address is edited by hand", async () => {
    mockSearch.mockResolvedValue([]);
    renderField();

    await userEvent.type(screen.getByRole("combobox"), "My own address");

    expect(setFieldValue).not.toHaveBeenCalledWith(
      "step-1.event-parish",
      expect.anything(),
    );
  });

  it("shows a non-blocking notice when the lookup fails on a field with no coordinate", async () => {
    mockSearch.mockRejectedValue(new Error("network down"));
    renderField(addressLookupField({ line2FieldId: "event-address-line-2" }));

    await userEvent.type(screen.getByRole("combobox"), "Bridgetown");

    expect(
      await screen.findByText(/Address suggestions are unavailable/),
    ).toHaveAttribute("role", "status");
    // Input still usable.
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  describe("when address suggestions are unavailable", () => {
    const failLookup = async () => {
      mockSearch.mockRejectedValue(new Error("geocode request failed: 503"));
      renderField();
      await userEvent.type(screen.getByRole("combobox"), "Bridgetown");
      return screen.findByRole("button", { name: "Place pin" });
    };

    it("offers a map pin with plain guidance instead of an error", async () => {
      await failLookup();

      const guidance = screen.getByText(
        /Type your address, then move the pin on the map to where it is/,
      );
      expect(guidance).toHaveAttribute("role", "status");
      expect(guidance.textContent).not.toMatch(
        /google|nominatim|error|503|try again|later/i,
      );
      // The applicant can still type the address.
      expect(screen.getByRole("combobox")).toBeEnabled();
    });

    it("writes the placed pin to the routing coordinate", async () => {
      await userEvent.click(await failLookup());

      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "13.100000,-59.600000",
      );
    });

    it("keeps the placed pin when the address is edited afterwards", async () => {
      await userEvent.click(await failLookup());
      setFieldValue.mockClear();

      await userEvent.type(screen.getByRole("combobox"), " Road");

      expect(setFieldValue).not.toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "",
      );
    });

    it("keeps the map up when a later lookup succeeds", async () => {
      await failLookup();
      mockSearch.mockResolvedValue([]);

      await userEvent.type(screen.getByRole("combobox"), "X");
      await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));

      expect(screen.getByRole("button", { name: "Place pin" })).toBeTruthy();
    });
  });
});
