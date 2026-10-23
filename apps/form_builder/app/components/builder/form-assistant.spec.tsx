/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { WorkspaceAssistant } from "../global-assistant";
import { FormAssistant } from "./form-assistant";

vi.mock("../global-assistant", () => ({
  WorkspaceAssistant: vi.fn(() => null),
}));
vi.mock("../../server/registry", () => ({ validateRecipe: vi.fn() }));

it.each([undefined, "housing-service"])(
  "retains the AI service target %s without a preview snapshot",
  (serviceId) => {
    render(
      <FormAssistant
        user="editor"
        documentId="housing"
        serviceId={serviceId}
        draft={{ formId: "housing", title: "Housing", steps: [] }}
        catalog={{ components: [], blocks: [], custom: [] }}
        readOnly={false}
        onApply={vi.fn()}
      />,
    );
    const props = vi.mocked(WorkspaceAssistant).mock.calls.at(-1)?.[0];
    expect(props?.target).toEqual(serviceId ? { serviceId } : undefined);
    expect(props).not.toHaveProperty("artifact");
  },
);
