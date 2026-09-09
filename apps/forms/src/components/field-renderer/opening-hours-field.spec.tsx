import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import {
  OpeningHoursField,
  parseOpeningHours,
  serializeOpeningHours,
  weekdaysShareHours,
} from "./opening-hours-field";
import type { FieldRenderContext } from "./render-context";

// ---------------------------------------------------------------------------
// The component is fully controlled by form state (ctx.f.state.value), so the
// harness holds that value in React state and feeds commits back in — the same
// loop TanStack Form provides in the app.
// ---------------------------------------------------------------------------
let committed: unknown;

function Harness({ initial, step }: { initial?: string[]; step?: number }) {
  const [value, setValue] = useState<unknown>(initial);
  const ctx = {
    field: {
      id: "opening-hours-opening-hours",
      step,
      label: "When is the restaurant open?",
      hint: 'Select "Add hours" for each day the restaurant is open.',
    },
    f: { state: { value }, handleBlur: () => {} },
    commitChange: (next: unknown) => {
      committed = next;
      setValue(next);
    },
    invalid: undefined,
    hintId: "opening-hours-opening-hours-hint",
    errorId: undefined,
    errorMessage: "",
    describedBy: "opening-hours-opening-hours-hint",
    labelClass: (base: string) => base,
    labelSuffix: null,
  } as unknown as FieldRenderContext;
  return <OpeningHoursField ctx={ctx} />;
}

beforeEach(() => {
  committed = undefined;
});

const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("parseOpeningHours / serializeOpeningHours", () => {
  it("round-trips complete entries in Monday-first order", () => {
    const entries = [
      "Monday 09:00 - 17:00",
      "Monday 18:00 - 22:00",
      "Sunday 10:00 - 14:00",
    ];
    expect(serializeOpeningHours(parseOpeningHours(entries))).toEqual(entries);
  });

  it("round-trips a set that has been added but not completed", () => {
    expect(serializeOpeningHours(parseOpeningHours(["Wednesday -"]))).toEqual([
      "Wednesday -",
    ]);
    expect(
      serializeOpeningHours(parseOpeningHours(["Friday 09:00 -"])),
    ).toEqual(["Friday 09:00 -"]);
  });

  it("preserves native times with seconds so an invalid draft can be corrected", () => {
    const entries = ["Monday 09:00:30 - 17:00:30", "Tuesday 09:00:30.125 -"];
    expect(serializeOpeningHours(parseOpeningHours(entries))).toEqual(entries);
  });

  it("drops entries that are not opening hours instead of crashing", () => {
    const week = parseOpeningHours(["Someday 09:00 - 17:00", 42, "garbage"]);
    expect(serializeOpeningHours(week)).toEqual([]);
  });
});

describe("weekdaysShareHours", () => {
  it("recognises shared weekday hours, ignoring the weekend", () => {
    const shared = parseOpeningHours([
      "Monday 09:00 - 17:00",
      "Tuesday 09:00 - 17:00",
      "Wednesday 09:00 - 17:00",
      "Thursday 09:00 - 17:00",
      "Friday 09:00 - 17:00",
      "Saturday 10:00 - 14:00",
    ]);
    expect(weekdaysShareHours(shared)).toBe(true);
    expect(weekdaysShareHours(parseOpeningHours([]))).toBe(false);
    expect(
      weekdaysShareHours(parseOpeningHours(["Monday 09:00 - 17:00"])),
    ).toBe(false);
  });
});

describe("OpeningHoursField", () => {
  it('renders all seven days, spelled out, as "Not open" when nothing is set', () => {
    render(<Harness />);
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Not open")).toHaveLength(7);
    expect(
      screen.getAllByRole("button", { name: /Add hours for/ }),
    ).toHaveLength(7);
  });

  it("adds a set of hours for a day and commits the picked times", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Add hours for Monday" }),
    );
    expect(committed).toEqual(["Monday -"]);

    setTime("Monday opening time", "09:00");
    setTime("Monday closing time", "17:00");
    expect(committed).toEqual(["Monday 09:00 - 17:00"]);
    expect(screen.getAllByText("Not open")).toHaveLength(6);
  });

  it.each([undefined, 1, 90, 0, -60, 60, 1800])(
    "uses whole-minute picker increments for a configured step of %s",
    (step) => {
      render(<Harness initial={["Monday 09:00 - 17:00"]} step={step} />);
      const input = screen.getByLabelText(
        "Monday opening time",
      ) as HTMLInputElement;
      input.stepUp();
      expect(input.value).toBe(step === 1800 ? "09:30" : "09:01");
    },
  );

  it("keeps a range with seconds visible and preserves it when another day changes", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Monday 09:00:30 - 17:00:30"]} step={1} />);
    expect(screen.getByLabelText("Monday opening time")).toHaveValue(
      "09:00:30",
    );
    await user.click(
      screen.getByRole("button", { name: "Add hours for Tuesday" }),
    );
    expect(committed).toEqual(["Monday 09:00:30 - 17:00:30", "Tuesday -"]);
    setTime("Monday opening time", "09:00");
    setTime("Monday closing time", "17:00");
    expect(committed).toEqual(["Monday 09:00 - 17:00", "Tuesday -"]);
  });

  it("keeps the days independent and orders entries Monday-first", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Friday 11:00 - 15:00"]} />);

    await user.click(
      screen.getByRole("button", { name: "Add hours for Monday" }),
    );
    setTime("Monday opening time", "08:00");
    setTime("Monday closing time", "12:00");
    expect(committed).toEqual(["Monday 08:00 - 12:00", "Friday 11:00 - 15:00"]);
  });

  it("removes a set of hours and returns the day to Not open", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Tuesday 09:00 - 17:00"]} />);

    await user.click(
      screen.getByRole("button", { name: "Remove hours for Tuesday" }),
    );
    expect(committed).toEqual([]);
    expect(screen.getAllByText("Not open")).toHaveLength(7);
  });

  it("numbers the pickers when a day holds several sets, and caps a day at three", () => {
    render(
      <Harness
        initial={[
          "Saturday 09:00 - 12:00",
          "Saturday 13:00 - 17:00",
          "Saturday 18:00 - 22:00",
        ]}
      />,
    );

    expect(
      screen.getByLabelText("Saturday opening time, set 2"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add hours for Saturday" }),
    ).not.toBeInTheDocument();
    // The other days are unaffected by Saturday's cap.
    expect(
      screen.getByRole("button", { name: "Add hours for Sunday" }),
    ).toBeInTheDocument();
  });

  it("moves focus to the new set's opening time after Add hours", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getByRole("button", { name: "Add hours for Thursday" }),
    );
    expect(screen.getByLabelText("Thursday opening time")).toHaveFocus();
  });

  describe("same hours every weekday", () => {
    const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const tickBox = async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(
        screen.getByRole("checkbox", {
          name: "The hours are the same every weekday (Monday to Friday)",
        }),
      );

    it("collapses Monday to Friday into one row that writes to all five days", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await tickBox(user);
      expect(screen.getByText("Monday to Friday")).toBeInTheDocument();
      expect(screen.queryByText("Tuesday")).not.toBeInTheDocument();
      // The weekend stays per-day.
      expect(screen.getByText("Saturday")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Add hours for Monday to Friday" }),
      );
      setTime("Monday to Friday opening time", "09:00");
      setTime("Monday to Friday closing time", "17:00");
      expect(committed).toEqual(WEEKDAYS.map((day) => `${day} 09:00 - 17:00`));
    });

    it("spreads the first weekday's existing hours when ticked", async () => {
      const user = userEvent.setup();
      render(<Harness initial={["Wednesday 11:00 - 15:00"]} />);

      await tickBox(user);
      expect(committed).toEqual(WEEKDAYS.map((day) => `${day} 11:00 - 15:00`));
    });

    it("confirms replacement of different weekday hours and lets the applicant cancel", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const weekend = "Saturday 10:00 - 14:00";
      render(
        <Harness
          initial={["Monday 09:00 - 17:00", "Tuesday 10:00 - 16:00", weekend]}
        />,
      );
      try {
        await tickBox(user);
        expect(confirm).toHaveBeenCalledWith(
          "Use Monday's hours for every weekday? This will replace the other weekday hours you have entered.",
        );
        expect(committed).toBeUndefined();
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        expect(screen.getByLabelText("Tuesday opening time")).toHaveValue(
          "10:00",
        );
        expect(screen.getByLabelText("Tuesday closing time")).toHaveValue(
          "16:00",
        );

        confirm.mockReturnValue(true);
        await tickBox(user);
        expect(committed).toEqual([
          ...WEEKDAYS.map((day) => `${day} 09:00 - 17:00`),
          weekend,
        ]);
        expect(screen.getByRole("checkbox")).toBeChecked();
        await tickBox(user);
        expect(screen.getByLabelText("Tuesday opening time")).toHaveValue(
          "09:00",
        );
      } finally {
        confirm.mockRestore();
      }
    });

    it("starts combined when every weekday already shares the same hours", () => {
      render(
        <Harness initial={WEEKDAYS.map((day) => `${day} 09:00 - 17:00`)} />,
      );
      expect(
        screen.getByRole("checkbox", {
          name: "The hours are the same every weekday (Monday to Friday)",
        }),
      ).toBeChecked();
      expect(screen.getByText("Monday to Friday")).toBeInTheDocument();
    });

    it("keeps the shared hours, editable per day, when unticked", async () => {
      const user = userEvent.setup();
      render(
        <Harness initial={WEEKDAYS.map((day) => `${day} 09:00 - 17:00`)} />,
      );

      await tickBox(user); // untick — it starts checked
      expect(screen.getByText("Tuesday")).toBeInTheDocument();
      expect(screen.getByLabelText("Tuesday opening time")).toHaveValue(
        "09:00",
      );
    });
  });

  it("has no axe violations, empty and populated", async () => {
    const { container, unmount } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    const populated = render(
      <Harness
        initial={[
          "Monday 09:00 - 17:00",
          "Monday 18:00 - 22:00",
          "Sunday 10:00 - 14:00",
        ]}
      />,
    );
    expect(await axe(populated.container)).toHaveNoViolations();
  });
});
