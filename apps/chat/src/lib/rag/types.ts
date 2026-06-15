export interface Source {
  id: string;
  url: string;
  title: string;
  section?: string;
  score: number;
  excerpt?: string;
  // The forms-API recipe id from the service frontmatter (form_id), when the
  // service starts a form. The document id's slug is the landing folder name,
  // which only coincidentally matches a form_id — prefer this.
  formId?: string;
  // Landing serves <url>/start for this service — the signal the chat needs to
  // hand the user a start-page deep link (no forms API required).
  hasStartPage?: boolean;
}

// A "Start now" handoff for a chat-approved service with a start page: a deep
// link to <service url>/start. Surfaced alongside an answer when forms are on.
export interface Handoff {
  formId: string;
  title: string;
  startUrl: string;
}

// Numbered citation surfaced to the client, referenced by [N] markers in the
// assistant's reply.
export interface Citation {
  number: string;
  url: string;
  title: string;
  section?: string;
}

export interface RetrievedContext {
  title: string;
  section?: string;
  text: string;
}

export interface RetrieveResponse {
  contexts: RetrievedContext[];
  sources: Source[];
}
