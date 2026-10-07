import { attachmentMetadata } from "./attachment-data";
import { uiMessagesToWire } from "@tanstack/ai/client";
import { createAiAccess } from "../../../server/ai-builder/access";
import { aiUploadSchema, type AiContext } from "@govtech-bb/form-builder";
import type { ChatFetcherInput, UIMessage } from "@tanstack/ai-client";

export async function aiRequest(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  const access = await createAiAccess().catch(() => {
    throw new Error("The AI service could not be reached. Retry in a moment.");
  });
  signal.throwIfAborted();
  const response = await fetch(access.url + path, {
    method: "POST",
    signal,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + access.token,
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    if (signal.aborted) throw error;
    throw new Error("The AI service could not be reached. Retry in a moment.");
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.error ?? "The AI service could not be reached. Retry in a moment.",
    );
  }
  return response;
}

export function boundedMessages(messages: UIMessage[]): UIMessage[] {
  const starts = messages.flatMap((message, index) =>
    message.role === "user" ? [index] : [],
  );
  return messages.slice(starts.at(-20) ?? 0);
}

export function streamChat(
  input: ChatFetcherInput,
  context: AiContext,
  signal: AbortSignal,
) {
  return aiRequest(
    "/chat",
    {
      ...input,
      // Originals stay in S3. Preserve attachment metadata for UI snapshots; Bedrock uses the owned Textract output.
      messages: uiMessagesToWire(
        boundedMessages(input.messages).map((message) => ({
          ...message,
          parts: message.parts.filter(
            (part) =>
              !(
                (part.type === "image" || part.type === "document") &&
                attachmentMetadata(part)
              ),
          ),
        })),
      ),
      tools: [],
      context: [],
      state: {},
      forwardedProps: context,
    },
    signal,
  );
}

export type Attachment = {
  id?: string;
  source?: string;
  type?: "application/pdf" | "image/png" | "image/jpeg";
  size?: number;
  name: string;
  reference: string;
  status: "uploaded" | "reading" | "ready";
  error?: string;
};

export async function uploadDocument(
  file: File,
  signal: AbortSignal,
): Promise<Attachment> {
  const metadata = aiUploadSchema.parse({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  const signed = await (
    await aiRequest("/documents/presign", metadata, signal)
  ).json();
  const data = new FormData();
  for (const [key, value] of Object.entries(signed.fields))
    data.append(key, String(value));
  data.append("file", file);
  const response = await fetch(signed.url, {
    method: "POST",
    body: data,
    signal,
  });
  if (!response.ok)
    throw new Error("The document upload failed. Try uploading it again.");
  return {
    id: crypto.randomUUID(),
    source: new URL(
      String(signed.fields.key).split("/").map(encodeURIComponent).join("/"),
      signed.url,
    ).href,
    name: file.name,
    type: metadata.type,
    size: file.size,
    reference: signed.reference,
    status: "uploaded",
  };
}

export async function readDocument(
  attachment: Attachment,
  signal: AbortSignal,
  update: (value: Attachment) => void,
): Promise<void> {
  let current = attachment;
  if (current.status === "uploaded") {
    const { reference } = await (
      await aiRequest(
        "/documents/start",
        { reference: current.reference },
        signal,
      )
    ).json();
    current = { ...current, reference, status: "reading", error: undefined };
    update(current);
  }
  const deadline = Date.now() + 180000;
  let failures = 0;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    let result;
    try {
      result = await (
        await aiRequest(
          "/documents/status",
          { reference: current.reference },
          signal,
        )
      ).json();
      failures = 0;
    } catch (error) {
      if (signal.aborted || ++failures >= 3) throw error;
    }
    if (result?.status === "done") {
      update({ ...current, status: "ready", error: undefined });
      return;
    }
    if (result?.status === "failed") throw new Error(result.error);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Stopped", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 2000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error(
    "Document extraction is taking longer than expected. Retry to check the same upload.",
  );
}
