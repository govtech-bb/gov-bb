/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
  },
  {
    fieldId: "dob",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Date of birth",
    isBoolean: false,
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

  it("starts in Fixed mode for an unset amount", () => {
    render(<Harness initialAmount={undefined} />);
    expect(screen.getByLabelText("Amount type")).toHaveValue("fixed");
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });
});

describe("AmountEditor — conditional field value", () => {
  it("compiles a field-equality rule to a values.-prefixed if-chain", async () => {
    render(<Harness initialAmount={10} />);

    await userEvent.selectOptions(
      screen.getByLabelText("Amount type"),
      "conditional",
    );
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await userEvent.selectOptions(
      screen.getByLabelText("Condition field"),
      "applicant.nationality",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Condition operator"),
      "notEqual",
    );
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

  it("opens an existing field if-chain in Conditional mode, rule populated", () => {
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
    expect(screen.getByLabelText("Amount type")).toHaveValue("conditional");
    expect(screen.getByLabelText("Compare")).toHaveValue("field");
    expect(screen.getByLabelText("Condition field")).toHaveValue(
      "applicant.nationality",
    );
    expect(screen.getByLabelText("Condition operator")).toHaveValue("equal");
    expect(screen.getByLabelText("Comparison value")).toHaveValue("national");
    expect(screen.getByLabelText("Rule amount")).toHaveValue(5);
    expect(screen.getByLabelText("Otherwise charge")).toHaveValue(15);
  });
});

describe("AmountEditor — conditional age band", () => {
  it("compiles an `age of field` ordering rule to the age op", async () => {
    render(<Harness initialAmount={25} />);

    await userEvent.selectOptions(
      screen.getByLabelText("Amount type"),
      "conditional",
    );
    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await userEvent.selectOptions(screen.getByLabelText("Compare"), "age");
    await userEvent.selectOptions(
      screen.getByLabelText("Condition field"),
      "applicant.dob",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Condition operator"),
      "lessThan",
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
      if: [
        { "<": [{ age: [{ var: "values.applicant.dob" }] }, 16] },
        5,
        20,
      ],
    });
  });

  it("opens an existing age if-chain with the age subject selected", () => {
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
    expect(screen.getByLabelText("Compare")).toHaveValue("age");
    expect(screen.getByLabelText("Condition field")).toHaveValue(
      "applicant.dob",
    );
    expect(screen.getByLabelText("Condition operator")).toHaveValue(
      "greaterThanOrEqual",
    );
    expect(screen.getByLabelText("Comparison value")).toHaveValue(60);
    expect(screen.getByLabelText("Otherwise charge")).toHaveValue(25);
  });
});

describe("AmountEditor — advanced fallback", () => {
  it("renders an unrecognized expression read-only, with no type toggle", () => {
    const raw = { reduce: [{ var: "values.items" }, {}, 0] };
    render(<Harness initialAmount={raw} />);

    expect(screen.queryByLabelText("Amount type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(
      screen.getByText(/"reduce"/, { selector: ".processorReadOnly" }),
    ).toBeInTheDocument();
  });
});
