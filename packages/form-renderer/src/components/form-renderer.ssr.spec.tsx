// @vitest-environment node
/**
 * form-renderer.ssr.spec.tsx
 *
 * Server-render smoke test. FormRenderer moved into the package so a future SSR
 * host (the landing app) can render forms on the server — this guards that the
 * whole render tree (FormRenderer → ActiveStep → FieldRenderer) touches no
 * browser globals (`window`, `document`, `sessionStorage`) during a server
 * render. It renders a real form built from a tiny inline contract via
 * `buildForm` + `useForm`, wrapped in the transport provider, through
 * `renderToString` and asserts it does not throw.
 *
 * `@tanstack/react-router`'s `useNavigate` is stubbed: the step guard reads it
 * at render time and it needs a RouterProvider the SSR host supplies — the
 * router wiring is out of scope for this smoke test (mirrors use-step-guard's
 * own spec).
 *
 * A second case renders with the active step set to the build-form-injected
 * `check-your-answers` step, so the Review component (which reads a `file`
 * field's value and does an `instanceof File` check) is exercised under node
 * too, not just the text-field step.
 */

import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useRef } from "react";
import { useForm } from "@tanstack/react-form";
import FormRenderer from "./form-renderer";
import { FormTransportProvider } from "../transport/context";
import { buildForm } from "../model";
import type { FormTransport } from "../transport/types";
import type { ClientServiceContract, FormValues } from "../types";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
}));

const contract: ClientServiceContract = {
  formId: "ssr-form",
  title: "SSR Test Form",
  description: "A minimal form for the SSR smoke test.",
  version: "1.0.0",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  steps: [
    {
      stepId: "personal",
      title: "Personal details",
      fields: [
        {
          id: "personal_firstName",
          fieldId: "firstName",
          stepId: "personal",
          name: "firstName",
          label: "First name",
          htmlType: "text",
          disabled: false,
          hidden: false,
          conditionallyHidden: false,
        },
        {
          id: "personal_attachment",
          fieldId: "attachment",
          stepId: "personal",
          name: "attachment",
          label: "Attachment",
          htmlType: "file",
          disabled: false,
          hidden: false,
          conditionallyHidden: false,
        },
      ],
    },
    {
      stepId: "submission-confirmation",
      title: "Confirmation",
      fields: [],
    },
  ],
};

// Transport is never invoked during a server render of a text-field step; a
// stub satisfies the provider contract.
const transport: FormTransport = {
  submit: async () => {
    throw new Error("not used in SSR smoke test");
  },
  uploadFile: async () => {
    throw new Error("not used in SSR smoke test");
  },
};

function Harness() {
  const formMeta = buildForm(contract);
  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
  });
  const repeatableStepSettingsRef = useRef(formMeta.repeatSettings);
  return (
    <FormTransportProvider transport={transport}>
      <FormRenderer
        form={form}
        formMeta={formMeta}
        stepId={formMeta.steps[0].stepId}
        visibleSteps={formMeta.steps}
        repeatableStepSettingsRef={repeatableStepSettingsRef}
      />
    </FormTransportProvider>
  );
}

// buildForm injects a `check-your-answers` step (before submission-confirmation)
// when the contract doesn't already carry one — so formMeta.steps includes it
// even though the inline `contract` above never lists it explicitly.
function ReviewHarness() {
  const formMeta = buildForm(contract);
  // A previously-uploaded file is stored as a plain { name } object, not a
  // browser File instance — this also exercises Review's "not a File" branch.
  const defaultValues = {
    ...formMeta.defaultValues,
    personal_attachment: [{ name: "passport.pdf" }],
  } as FormValues;
  const form = useForm({ defaultValues });
  const repeatableStepSettingsRef = useRef(formMeta.repeatSettings);
  return (
    <FormTransportProvider transport={transport}>
      <FormRenderer
        form={form}
        formMeta={formMeta}
        stepId="check-your-answers"
        visibleSteps={formMeta.steps}
        repeatableStepSettingsRef={repeatableStepSettingsRef}
      />
    </FormTransportProvider>
  );
}

describe("FormRenderer SSR", () => {
  it("renders on the server without touching window/sessionStorage", () => {
    const html = renderToString(<Harness />);
    expect(() => renderToString(<Harness />)).not.toThrow();
    // Proves it produced a real render tree, not a no-op.
    expect(html).toContain("SSR Test Form");
  });

  it("renders the check-your-answers review step on the server", () => {
    const html = renderToString(<ReviewHarness />);
    expect(() => renderToString(<ReviewHarness />)).not.toThrow();
    // Proves Review rendered the "personal" step's answers, including the
    // file field's guarded `instanceof File` display-name logic.
    expect(html).toContain("passport.pdf");
  });
});
