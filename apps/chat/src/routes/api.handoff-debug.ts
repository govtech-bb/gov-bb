import { createFileRoute } from "@tanstack/react-router";
import { getFormDefinition } from "#/lib/chat/form/defs";
import { matchFormsFromText } from "#/lib/chat/form/detect";
import { needsHandoff } from "#/lib/chat/form/schema";
import { getServerEnv } from "#/config/env";

// Temporary diagnostic for PR #979 — proves what the chat's Lambda actually
// sees vs what we test against locally. Remove before merge.
async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "get-birth-certificate";
  const probeText =
    url.searchParams.get("text") ?? "I want a copy of my birth certificate";

  const env = getServerEnv();
  const matched = await matchFormsFromText(probeText);
  const contract = await getFormDefinition(slug);

  if (!contract) {
    return Response.json({
      slug,
      formApiUrl: env.FORM_API_URL,
      contract: null,
      reason: "getFormDefinition returned null",
    });
  }

  const stepIds = contract.steps.map((s) => s.stepId);
  const fieldIds = contract.steps.flatMap((s) =>
    s.elements.map((e) => e.fieldId),
  );
  const htmlTypes = contract.steps.flatMap((s) =>
    s.elements.map((e) => e.htmlType),
  );

  return Response.json({
    slug,
    probeText,
    matcherPicked: matched
      ? { formId: matched.formId, title: matched.title }
      : null,
    formApiUrl: env.FORM_API_URL,
    contractFound: true,
    formId: contract.formId,
    version: contract.version,
    stepIds,
    requiresPayment: (contract as { requiresPayment?: boolean })
      .requiresPayment,
    hasFileField: htmlTypes.includes("file"),
    sensitiveFieldIds: fieldIds.filter((id) =>
      /^(bank-|account-(name|number|holder|type)|sort-code|routing-)/.test(id),
    ),
    needsHandoff: needsHandoff(contract),
  });
}

export const Route = createFileRoute("/api/handoff-debug")({
  server: {
    handlers: {
      GET: ({ request }) => handleGet(request),
    },
  },
});
