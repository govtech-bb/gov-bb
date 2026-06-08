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

describe("AmountEditor — conditional", () => {
  it("compiles a rule plus default to a JSONLogic if-chain", async () => {
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
    await userEvent.type(
      screen.getByLabelText("Comparison value"),
      "national",
    );
    const ruleAmount = screen.getByLabelText("Rule amount");
    await userEvent.clear(ruleAmount);
    await userEvent.type(ruleAmount, "20");

    const otherwise = screen.getByLabelText("Otherwise charge");
    await userEvent.clear(otherwise);
    await userEvent.type(otherwise, "10");

    expect(amountState()).toEqual({
      if: [
        { "!=": [{ var: "applicant.nationality" }, "national"] },
        20,
        10,
      ],
    });
  });

  it("opens an existing if-chain in Conditional mode with the rule populated", () => {
    render(
      <Harness
        initialAmount={{
          if: [
            { "==": [{ var: "applicant.nationality" }, "national"] },
            5,
            15,
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("Amount type")).toHaveValue("conditional");
    expect(screen.getByLabelText("Condition field")).toHaveValue(
      "applicant.nationality",
    );
    expect(screen.getByLabelText("Condition operator")).toHaveValue("equal");
    expect(screen.getByLabelText("Comparison value")).toHaveValue("national");
    expect(screen.getByLabelText("Rule amount")).toHaveValue(5);
    expect(screen.getByLabelText("Otherwise charge")).toHaveValue(15);
  });

  it("removes a rule, collapsing the chain back toward the default", async () => {
    render(
      <Harness
        initialAmount={{
          if: [{ "==": [{ var: "applicant.nationality" }, "x"] }, 5, 15],
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove rule/i }));
    // No rules left → bare default number.
    expect(amountState()).toBe(15);
  });
});

describe("AmountEditor — advanced fallback", () => {
  it("renders an unrecognized expression read-only, with no type toggle", () => {
    const raw = { age: [{ var: "applicant.dob" }] };
    render(<Harness initialAmount={raw} />);

    // No destructive controls.
    expect(screen.queryByLabelText("Amount type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    // The raw expression is shown read-only so the author can see what's there.
    expect(
      screen.getByText(/"age"/, { selector: ".processorReadOnly" }),
    ).toBeInTheDocument();
  });
});
