import { attachmentMetadata } from "./attachment-data";
import {
  indexedDBPersistence,
  type ChatClientPersistence,
  type UIMessage,
} from "@tanstack/ai-client";
import { redactAiData } from "@govtech-bb/form-builder";

export type Conversation = { id: string; title: string };
const storage = indexedDBPersistence({
  databaseName: "gov-bb-builder-ai",
  keyPrefix: "v1:",
});
const deleted = new Set<string>();
const writes = new Map<string, Promise<void>>();

export function historyKey(
  user: string,
  kind: string,
  documentId: string,
): string {
  return JSON.stringify(["builder-ai-v1", user, kind, documentId]);
}
export function readConversations(key: string): Conversation[] {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is Conversation =>
            typeof item?.id === "string" && typeof item?.title === "string",
        )
        .slice(0, 50)
    : [];
}
export function writeConversations(key: string, conversations: Conversation[]) {
  localStorage.setItem(key, JSON.stringify(conversations));
}

// A restored transcript is reading context, never a command queue or a draft backup.
export function restoreTranscript(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.flatMap<UIMessage["parts"][number]>((part) => {
        if (part.type === "text") return [part];
        if (
          (part.type === "image" || part.type === "document") &&
          attachmentMetadata(part)
        )
          return [part];
        if (part.type !== "tool-call") return [];
        const summary =
          part.input &&
          typeof part.input === "object" &&
          "summary" in part.input
            ? String(part.input.summary)
            : part.name.replaceAll("_", " ");
        const applied =
          part.output &&
          typeof part.output === "object" &&
          "applied" in part.output &&
          part.output.applied === true;
        return [
          {
            type: "text" as const,
            content:
              (applied
                ? "Applied to the draft in that session: "
                : "Earlier proposal or tool activity (not resumed): ") +
              summary,
          },
        ];
      }),
    }))
    .filter((message) => message.parts.length > 0);
}

export function conversationPersistence(
  onFailure: () => void,
  onInterrupted: () => void,
): ChatClientPersistence {
  return {
    async getItem(id) {
      try {
        const value = await storage.getItem(id);
        if (value?.messages.at(-1)?.metadata?.builderInterrupted)
          onInterrupted();
        return value ? { messages: restoreTranscript(value.messages) } : null;
      } catch {
        onFailure();
        return null;
      }
    },
    async setItem(id, state) {
      if (deleted.has(id)) return;
      const write = Promise.resolve(writes.get(id)).then(() => {
        if (deleted.has(id)) return;
        const messages = restoreTranscript(
          redactAiData(state.messages) as UIMessage[],
        );
        const last = messages.at(-1);
        if (last)
          last.metadata = {
            ...last.metadata,
            builderInterrupted: !!state.resume,
          };
        return storage.setItem(id, { messages });
      });
      writes.set(id, write);
      try {
        await write;
      } catch {
        onFailure();
      } finally {
        if (writes.get(id) === write) writes.delete(id);
      }
    },
    async removeItem(id) {
      try {
        await storage.removeItem(id);
      } catch {
        onFailure();
      }
    },
  };
}
export async function deleteConversation(id: string) {
  deleted.add(id);
  await writes.get(id)?.catch(() => {});
  await storage.removeItem(id);
  localStorage.removeItem(id + ":document");
}
