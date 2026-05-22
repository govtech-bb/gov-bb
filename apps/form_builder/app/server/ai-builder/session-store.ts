import { randomUUID } from "crypto";
import type { ChatMessage } from "./types";

export interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
  recipe: Record<string, any> | null;
  systemPrompt: string;
  pdfPages?: string[];
  publishedFormId?: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export function create(name?: string): Session {
  const id = randomUUID();
  const session: Session = {
    id,
    name: name ?? `Session ${new Date().toISOString()}`,
    messages: [],
    recipe: null,
    systemPrompt: "",
    createdAt: new Date(),
  };
  sessions.set(id, session);
  return session;
}

export function get(id: string): Session | null {
  return sessions.get(id) ?? null;
}

export function getOrThrow(id: string): Session {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);
  return session;
}

/** Test helper — never call in app code. */
export function _resetForTests(): void {
  sessions.clear();
}
