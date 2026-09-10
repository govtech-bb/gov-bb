import { openSelect, chooseOption } from "../../test/select";
/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ResolvedFieldId } from "@govtech-bb/form-builder";
import { AmountEditor } from "./-amount-editor";

const FIELDS: ResolvedFieldId[] = [
  {
    fieldId: "nationality",
    editorFieldId: "e1",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Nationality",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "dob",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Date of birth",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "number-of-copies",
    editorFieldId: "e3",
    stepId: "order-details",
    stepTitle: "Order details",
    display: "Number of copies",
    isBoolean: false,
    isNumeric: true,
  },
];

function Harness({ initialAmount }: { initialAmount: unknown }) {
  const [amount, setAmount] = useState<unknown>(initialAmount);
  return (
    <>
      <AmountEditor
        amount={amount}
        fields={FIELDS}
        idPrefix="p1"
        onChange={setAmount}
      />
      <pre data-testid="amount">{JSON.stringify(amount ?? null)}</pre>
    </>
  );
}

function amountState(): unknown {
  return JSON.parse(screen.getByTestId("amount").textContent || "null");
}

describe("AmountEditor — fixed", () => {
  it("renders a numeric input for a literal amount and emits the number on edit", async () => {
    render(<Harness initialAmount={10} />);
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveValue(10);

    await userEvent.clear(input);
    await userEvent.type(input, "25");
    expect(amountState()).toBe(25);
  });

  it("starts in Fixed mode for an unset amount", async () => {
    render(<Harness initialAmount={undefined} />);
    expect(screen.getByLabelText("Amount type")).toHaveTextContent(
      "Fixed amount",
    );
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });
});

describe("AmountEditor — conditional field value", () => {
  it("compiles a field-equality rule to a values.-prefixed if-chain", async () => {
    render(<Harness initialAmount={10} />);

    await chooseOption(
      screen.getByLabelText("Amount type"),
      "Conditional amount",
    );
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await chooseOption(
      screen.getByLabelText("Condition field"),
      new RegExp("\\(applicant\\.nationality\\)$"),
    );
    await chooseOption(screen.getByLabelText("Condition operator"), "is not");
    await userEvent.type(screen.getByLabelText("Comparison value"), "national");
    const ruleAmount = screen.getByLabelText("Rule amount");
    await userEvent.clear(ruleAmount);
    await userEvent.type(ruleAmount, "20");

    const otherwise = screen.getByLabelText("Otherwise charge");
    await userEvent.clear(otherwise);
    await userEvent.type(otherwise, "10");

    expect(amountState()).toEqual({
      if: [
        { "!=": [{ var: "values.applicant.nationality" }, "national"] },
        20,
        10,
      ],
    });
  });

  it("opens an existing field if-chain in Conditional mode, rule populated", async () => {
    render(
      <Harness
        initialAmount={{
          if: [
            { "==": [{ var: "values.applicant.nationality" }, "national"] },
            5,
            15,
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("Amount type")).toHaveTextContent(
      "Conditional amount",
    );
    expect(screen.getByLabelText("Compare")).toHaveTextContent("Field value");
    expect(screen.getByLabelText("Condition field")).toHaveTextContent(
      "applicant.nationality",
    );
    expect(screen.getByLabelText("Condition operator")).toHaveTextContent("is");
    expect(screen.getByLabelText("Comparison value")).toHaveValue("national");
    expect(screen.getByLabelText("Rule amount")).toHaveValue(5);
    expect(screen.getByLabelText("Otherwise charge")).toHaveValue(15);
  });
});

describe("AmountEditor — conditional age band", () => {
  it("compiles an `age of field` ordering rule to the age op", async () => {
    render(<Harness initialAmount={25} />);

    await chooseOption(
      screen.getByLabelText("Amount type"),
      "Conditional amount",
    );
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await chooseOption(screen.getByLabelText("Compare"), "Age of field");
    await chooseOption(
      screen.getByLabelText("Condition field"),
      new RegExp("\\(applicant\\.dob\\)$"),
    );
    await chooseOption(
      screen.getByLabelText("Condition operator"),
      "is less than",
    );
    const value = screen.getByLabelText("Comparison value");
    await userEvent.clear(value);
    await userEvent.type(value, "16");
    const ruleAmount = screen.getByLabelText("Rule amount");
    await userEvent.clear(ruleAmount);
    await userEvent.type(ruleAmount, "5");

    const otherwise = screen.getByLabelText("Otherwise charge");
    await userEvent.clear(otherwise);
    await userEvent.type(otherwise, "20");

    expect(amountState()).toEqual({
      if: [{ "<": [{ age: [{ var: "values.applicant.dob" }] }, 16] }, 5, 20],
    });
  });

  it("opens an existing age if-chain with the age subject selected", async () => {
    render(
      <Harness
        initialAmount={{
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("Compare")).toHaveTextContent("Age of field");
    expect(screen.getByLabelText("Condition field")).toHaveTextContent(
      "applicant.dob",
    );
    expect(screen.getByLabelText("Condition operator")).toHaveTextContent(
      "is at least",
    );
    expect(screen.getByLabelText("Comparison value")).toHaveValue(60);
    expect(screen.getByLabelText("Otherwise charge")).toHaveValue(25);
  });
});

describe("AmountEditor — quantity multiplier", () => {
  it("wraps a fixed amount in a `*` against the chosen numeric field", async () => {
    render(<Harness initialAmount={10} />);

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Multiply by a quantity field" }),
    );
    await chooseOption(
      screen.getByLabelText("Quantity field"),
      new RegExp("\\(order-details\\.number-of-copies\\)$"),
    );

    expect(amountState()).toEqual({
      "*": [10, { var: "values.order-details.number-of-copies" }],
    });
  });

  it("offers only numeric fields in the quantity picker", async () => {
    render(<Harness initialAmount={10} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Multiply by a quantity field" }),
    );

    const picker = screen.getByLabelText("Quantity field");
    expect(
      within(await openSelect(picker)).getByRole("option", {
        name: /Number of copies/,
      }),
    ).toBeInTheDocument();
    expect(
      within(await openSelect(picker)).queryByRole("option", {
        name: /Nationality/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(await openSelect(picker)).queryByRole("option", {
        name: /Date of birth/,
      }),
    ).not.toBeInTheDocument();
  });

  it("drops the multiplier when the checkbox is unticked", async () => {
    render(
      <Harness
        initialAmount={{
          "*": [10, { var: "values.order-details.number-of-copies" }],
        }}
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Multiply by a quantity field",
    });
    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText("Quantity field")).toHaveTextContent(
      "order-details.number-of-copies",
    );

    await userEvent.click(checkbox);
    expect(amountState()).toBe(10);
  });

  it("drops the multiplier when the quantity field is cleared, checkbox still ticked", async () => {
    render(
      <Harness
        initialAmount={{
          "*": [10, { var: "values.order-details.number-of-copies" }],
        }}
      />,
    );
    await chooseOption(
      screen.getByLabelText("Quantity field"),
      "— select field —",
    );

    expect(
      screen.getByRole("checkbox", { name: "Multiply by a quantity field" }),
    ).toBeChecked();
    expect(amountState()).toBe(10);
  });

  it("opens an existing conditional × quantity amount in the structured editor", async () => {
    render(
      <Harness
        initialAmount={{
          "*": [
            {
              if: [
                { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
                0,
                25,
              ],
            },
            { var: "values.order-details.number-of-copies" },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("Amount type")).toHaveTextContent(
      "Conditional amount",
    );
    expect(screen.getByLabelText("Compare")).toHaveTextContent("Age of field");
    expect(
      screen.getByRole("checkbox", { name: "Multiply by a quantity field" }),
    ).toBeChecked();
    expect(screen.getByLabelText("Quantity field")).toHaveTextContent(
      "order-details.number-of-copies",
    );
  });
});

describe("AmountEditor — advanced fallback", () => {
  it("renders an unrecognized expression read-only, with no type toggle", async () => {
    const raw = { reduce: [{ var: "values.items" }, {}, 0] };
    render(<Harness initialAmount={raw} />);

    expect(screen.queryByLabelText("Amount type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(
      screen.getByText(/"reduce"/, { selector: ".processorReadOnly" }),
    ).toBeInTheDocument();
  });
});
