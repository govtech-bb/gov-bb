export interface Source {
  id: string;
  url: string;
  title: string;
  section?: string;
  score: number;
  excerpt?: string;
  // The forms-API recipe id from the service's frontmatter (form_id), when
  // the service starts a form. THE identity to use against the forms API /
  // chat policy — the document id's slug is the landing folder name, which
  // only coincidentally matches a form_id (#1265).
  formId?: string;
}

// Numbered citation surfaced to the client and referenced by [N] markers
// in the assistant's reply text.
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
