export interface Source {
  id: string;
  url: string;
  title: string;
  section?: string;
  score: number;
  excerpt?: string;
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
