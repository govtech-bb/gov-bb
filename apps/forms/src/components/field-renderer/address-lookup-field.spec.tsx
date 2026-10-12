import type { Mock } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldRenderer from ".";
import type { ClientPrimitive } from "@forms/types";

vi.mock("@tanstack/react-form", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-form")>()),
  useStore: (_store: unknown, select: (state: unknown) => unknown) =>
    select(undefined),
}));

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
  resolvePlace: vi.fn(),
  reverseGeocode: vi.fn(),
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

import {
  resolvePlace,
  reverseGeocode,
  searchAddresses,
} from "../../lib/api/geocode";

const mockSearch = searchAddresses as Mock;
const mockResolve = resolvePlace as Mock;
const mockReverse = reverseGeocode as Mock;

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

// Sibling field values (parish, coordinate, line 2), keyed by field id.
let formValues: Record<string, unknown> = {};
const setFieldValue = vi.fn((id: string, value: unknown) => {
  formValues[id] = value;
});

const mockForm = {
  Field: ({
    children,
  }: {
    name: string;
    validators?: unknown;
    children: (f: typeof mockFieldApi) => React.ReactNode;
  }) => <>{children(mockFieldApi)}</>,
  getFieldValue: (id: string) => formValues[id],
  setFieldValue,
  store: {},
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
  const view = render(
    <FieldRenderer form={mockForm} field={field} validationProperties={{}} />,
  );
  return {
    ...view,
    /** Re-render, so the field sees a sibling value changed by another field. */
    refresh: () =>
      view.rerender(
        <FieldRenderer
          form={mockForm}
          field={field}
          validationProperties={{}}
        />,
      ),
  };
}

const confirmSpy = vi.spyOn(window, "confirm");

describe("AddressLookupField", () => {
  beforeEach(() => {
    mockState = { value: undefined, meta: { isValid: true, errors: [] } };
    vi.clearAllMocks();
    formValues = {};
    mockReverse.mockRejectedValue(new Error("reverse lookup failed: 503"));
    confirmSpy.mockReturnValue(true);
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

  it("clears line 2, the parish and the coordinate when line 1 is cleared", async () => {
    mockSearch.mockResolvedValue([
      {
        label: "Bay Street, Bridgetown, Barbados",
        lat: "13.1",
        lon: "-59.6",
        line1: "Bay Street",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    renderField();
    await userEvent.type(screen.getByRole("combobox"), "Bay");
    await userEvent.click(await screen.findByRole("option"));
    setFieldValue.mockClear();

    await userEvent.clear(screen.getByRole("combobox"));

    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-line-2",
      "",
    );
    expect(setFieldValue).toHaveBeenCalledWith("step-1.event-parish", "");
    expect(setFieldValue).toHaveBeenCalledWith(
      "step-1.event-address-coordinates",
      "",
    );
  });

  describe("once the lookup has filled the address", () => {
    const BAY = {
      label: "Bay Street, Bridgetown, Barbados",
      lat: "13.1",
      lon: "-59.6",
      line1: "Bay Street",
      line2: "Bridgetown",
      parish: "st-michael",
    };
    const pickBay = async () => {
      mockSearch.mockResolvedValue([BAY]);
      const view = renderField();
      await userEvent.type(screen.getByRole("combobox"), "Bay");
      await userEvent.click(await screen.findByRole("option"));
      setFieldValue.mockClear();
      return view;
    };

    it("asks before an edit, and cancelling keeps everything", async () => {
      confirmSpy.mockReturnValue(false);
      await pickBay();

      await userEvent.type(screen.getByRole("combobox"), "X");

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("combobox")).toHaveValue("Bay Street");
      expect(setFieldValue).not.toHaveBeenCalled();
    });

    it("clears line 2, the parish and the coordinate when the edit is confirmed, and asks only once", async () => {
      await pickBay();

      await userEvent.type(screen.getByRole("combobox"), "XY");

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("combobox")).toHaveValue("Bay StreetXY");
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-line-2",
        "",
      );
      expect(setFieldValue).toHaveBeenCalledWith("step-1.event-parish", "");
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "",
      );
    });

    it("keeps the lines but drops the coordinate when the parish is changed, and offers the map", async () => {
      const { refresh } = await pickBay();

      formValues["step-1.event-parish"] = "christ-church";
      refresh();

      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "",
      );
      expect(setFieldValue).not.toHaveBeenCalledWith(
        "step-1.event-address-line-2",
        "",
      );
      expect(screen.getByRole("combobox")).toHaveValue("Bay Street");
      expect(screen.getByText(/You changed the parish/)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Find it on the map" }),
      ).toBeTruthy();
    });

    it("does not treat its own parish fill as a change", async () => {
      const { refresh } = await pickBay();
      refresh();
      expect(setFieldValue).not.toHaveBeenCalled();
    });
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

  it("closes the list on Escape and leaves the text alone", async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue([
      {
        label: "Bay Street, Bridgetown, Barbados",
        lat: "13.1",
        lon: "-59.6",
        line1: "Bay Street",
        line2: "Bridgetown",
        parish: "st-michael",
      },
    ]);
    renderField();

    await user.type(screen.getByRole("combobox"), "Bay");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveValue("Bay");
  });

  describe("with Google place suggestions", () => {
    const OVAL = {
      label:
        "Kensington Oval, President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
      placeId: "ChIJ-oval",
      mainText: "Kensington Oval",
      secondaryText:
        "President Kennedy Drive, Bridgetown, Saint Michael, Barbados",
      matches: [{ start: 0, end: 6 }],
      line1: "Kensington Oval",
      line2: "President Kennedy Drive, Bridgetown",
      parish: "st-michael",
    };

    const pickOval = async () => {
      mockSearch.mockResolvedValue([OVAL]);
      renderField();
      await userEvent.type(screen.getByRole("combobox"), "kensin");
      await userEvent.click(await screen.findByRole("option"));
    };

    it("shows the name with the typed part bold, where it is, and Google's attribution", async () => {
      mockSearch.mockResolvedValue([OVAL]);
      renderField();

      await userEvent.type(screen.getByRole("combobox"), "kensin");
      const option = await screen.findByRole("option");

      expect(option.querySelector("strong")?.textContent).toBe("Kensin");
      expect(option.textContent).toContain("Kensington Oval");
      expect(option.textContent).toContain("President Kennedy Drive");
      expect(screen.getByText("Google Maps")).toHaveAttribute(
        "translate",
        "no",
      );
    });

    it("fills line 1 with the name, line 2 with the street and town, and the parish", async () => {
      mockResolve.mockResolvedValue({
        lat: "13.105",
        lon: "-59.6225",
        parish: "st-michael",
      });
      await pickOval();

      expect(handleChange).toHaveBeenLastCalledWith("Kensington Oval");
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-line-2",
        "President Kennedy Drive, Bridgetown",
      );
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-parish",
        "st-michael",
      );
    });

    it("looks up the coordinate of the pick in the same session as the search", async () => {
      mockResolve.mockResolvedValue({
        lat: "13.105",
        lon: "-59.6225",
        parish: "st-michael",
      });
      await pickOval();

      await waitFor(() =>
        expect(setFieldValue).toHaveBeenCalledWith(
          "step-1.event-address-coordinates",
          "13.105,-59.6225",
        ),
      );
      const searchSession = mockSearch.mock.calls[0][2];
      expect(searchSession).toEqual(expect.any(String));
      expect(mockResolve).toHaveBeenCalledWith("ChIJ-oval", searchSession);
    });

    it("does not write a late coordinate once the address has been edited", async () => {
      let answer: (place: unknown) => void = () => {};
      mockResolve.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      await pickOval();

      await userEvent.type(screen.getByRole("combobox"), " Stand");
      answer({ lat: "13.105", lon: "-59.6225", parish: "st-michael" });
      await new Promise((r) => setTimeout(r, 0));

      expect(setFieldValue).not.toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "13.105,-59.6225",
      );
    });

    it("offers the map pin when the coordinate cannot be looked up", async () => {
      mockResolve.mockRejectedValue(new Error("place lookup failed: 503"));
      await pickOval();

      expect(
        await screen.findByRole("button", { name: "Place pin" }),
      ).toBeTruthy();
    });
  });

  describe("when no address matches", () => {
    const findNoMatch = async () => {
      mockSearch.mockResolvedValue([]);
      renderField();
      await userEvent.type(screen.getByRole("combobox"), "Nowhere Lane");
      return screen.findByRole("button", {
        name: "Find it on the map",
      });
    };

    it("says so and offers the map behind a link, not up front", async () => {
      const link = await findNoMatch();

      const hint = link.closest("[role=status]")?.textContent;
      expect(hint).toMatch(/We cannot find that address/);
      // A routing address has to be located, so typing it is not offered.
      expect(hint).not.toMatch(/type it yourself/);
      expect(screen.queryByRole("button", { name: "Place pin" })).toBeNull();
    });

    it("opens the map when the link is clicked, with guidance to move the pin", async () => {
      await userEvent.click(await findNoMatch());

      expect(
        await screen.findByRole("button", { name: "Place pin" }),
      ).toBeTruthy();
      const guidance = screen.getByText(
        /Move the pin on the map to where the address is/,
      );
      expect(guidance).toHaveFocus();
      expect(guidance.textContent).not.toMatch(/at the moment/);
    });

    it("writes the placed pin to the routing coordinate", async () => {
      await userEvent.click(await findNoMatch());
      await userEvent.click(
        await screen.findByRole("button", { name: "Place pin" }),
      );

      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "13.100000,-59.600000",
      );
    });

    it("drops the link once a later lookup finds a match", async () => {
      await findNoMatch();
      mockSearch.mockResolvedValue([
        {
          label: "Nowhere Lane, Bridgetown, Barbados",
          lat: "13.1",
          lon: "-59.6",
          line1: "Nowhere Lane",
          line2: "Bridgetown",
          parish: "st-michael",
        },
      ]);

      await userEvent.type(screen.getByRole("combobox"), "s");
      await screen.findByRole("option");

      expect(
        screen.queryByRole("button", { name: "Find it on the map" }),
      ).toBeNull();
    });

    it("offers no map link on a field with no coordinate to write", async () => {
      mockSearch.mockResolvedValue([]);
      renderField(addressLookupField({ line2FieldId: "event-address-line-2" }));

      await userEvent.type(screen.getByRole("combobox"), "Nowhere Lane");
      await waitFor(() => expect(mockSearch).toHaveBeenCalled());

      expect(
        screen.queryByRole("button", { name: "Find it on the map" }),
      ).toBeNull();
    });
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

    it("asks before an edit drops the placed pin", async () => {
      await userEvent.click(await failLookup());
      setFieldValue.mockClear();

      await userEvent.type(screen.getByRole("combobox"), " Road");

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "",
      );
    });

    it("fills the address lines from the address at the pin, keeping the pin", async () => {
      mockReverse.mockResolvedValue({
        label: "President Kennedy Dr, Bridgetown, Saint Michael Barbados",
        lat: "13.100000",
        lon: "-59.600000",
        line1: "President Kennedy Dr",
        line2: "Bridgetown",
        parish: "st-michael",
      });
      await userEvent.click(await failLookup());

      await waitFor(() =>
        expect(handleChange).toHaveBeenLastCalledWith("President Kennedy Dr"),
      );
      expect(mockReverse).toHaveBeenCalledWith(13.1, -59.6);
      expect(screen.getByRole("combobox")).toHaveValue("President Kennedy Dr");
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-address-line-2",
        "Bridgetown",
      );
      expect(setFieldValue).toHaveBeenCalledWith(
        "step-1.event-parish",
        "st-michael",
      );
      // The coordinate stays the pin's own.
      const coordinateWrites = setFieldValue.mock.calls.filter(
        ([id]) => id === "step-1.event-address-coordinates",
      );
      expect(coordinateWrites.at(-1)?.[1]).toBe("13.100000,-59.600000");
    });

    it("does not overwrite an address typed while the pin's address was looked up", async () => {
      let answer: (result: unknown) => void = () => {};
      mockReverse.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      await userEvent.click(await failLookup());
      await waitFor(() => expect(mockReverse).toHaveBeenCalled());

      await userEvent.type(screen.getByRole("combobox"), " Gap");
      answer({
        label: "President Kennedy Dr, Bridgetown",
        line1: "President Kennedy Dr",
        line2: "Bridgetown",
        parish: "st-michael",
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(screen.getByRole("combobox")).toHaveValue("Bridgetown Gap");
    });

    it("leaves the address alone when there is no address at the pin", async () => {
      mockReverse.mockRejectedValue(new Error("reverse lookup failed: 404"));
      await userEvent.click(await failLookup());
      await waitFor(() => expect(mockReverse).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));

      expect(screen.getByRole("combobox")).toHaveValue("Bridgetown");
    });

    it("hides the map when asked, keeping the placed pin", async () => {
      await userEvent.click(await failLookup());
      setFieldValue.mockClear();

      await userEvent.click(
        screen.getByRole("button", { name: "Hide the map" }),
      );

      expect(screen.queryByRole("button", { name: "Place pin" })).toBeNull();
      expect(screen.getByRole("combobox")).toHaveFocus();
      expect(setFieldValue).not.toHaveBeenCalledWith(
        "step-1.event-address-coordinates",
        "",
      );
    });

    it("closes the map when a suggestion is picked", async () => {
      await failLookup();
      mockSearch.mockResolvedValue([
        {
          label: "Bay Street, Bridgetown, Barbados",
          lat: "13.1",
          lon: "-59.6",
          line1: "Bay Street",
          line2: "Bridgetown",
          parish: "st-michael",
        },
      ]);

      await userEvent.type(screen.getByRole("combobox"), " Bay");
      await userEvent.click(await screen.findByRole("option"));

      expect(screen.queryByRole("button", { name: "Place pin" })).toBeNull();
    });

    it("drops a placed pin when line 1 is cleared", async () => {
      await userEvent.click(await failLookup());
      setFieldValue.mockClear();

      await userEvent.clear(screen.getByRole("combobox"));

      expect(setFieldValue).toHaveBeenCalledWith(
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
