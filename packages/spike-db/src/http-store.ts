/**
 * The write path over HTTP — the `ApiStore` the `DocumentStore` comment
 * promised: "no consumer knows whether it is talking to PGlite in the browser
 * or, later, to `ApiStore` issuing the same SQL server-side".
 *
 * Same method names and same thrown errors as `PgliteStore`, so the editor's
 * save path, its conflict notice and its error summary need no changes. The
 * errors are rebuilt from the status code rather than shipped as classes:
 * 409 is a conflict, 422 carries `ValidationError[]` per block, and anything
 * else is a failure the caller should not try to interpret.
 */

import type { CollectionDefinition, PageDocument } from "@govtech-bb/block-kit";
import {
  ConflictError,
  ValidationFailedError,
  type DocumentSummary,
} from "./store";

/** The header carrying optimistic concurrency. Must match `api_v2`. */
const IF_UPDATED_AT = "if-updated-at";

export class HttpStore {
  constructor(private readonly baseUrl: string) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    /*
     * `...init` first, then headers — the other order let `init.headers`
     * replace the merged object wholesale rather than extend it, so every
     * write went out with no Content-Type. Fastify then declined to parse the
     * body, and the request arrived with `body` undefined, which surfaced as
     * rule 1 rejecting a perfectly good document for having no body at all.
     */
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    if (response.status === 409) {
      const body = await response.json();
      throw new ConflictError(body.documentId ?? "");
    }
    if (response.status === 422) {
      const body = await response.json();
      throw new ValidationFailedError(body.errors ?? []);
    }
    if (!response.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} — ${response.status}`);
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }

  async list(): Promise<DocumentSummary[]> {
    return await this.json<DocumentSummary[]>("/pages?drafts=true");
  }

  async get(id: string): Promise<PageDocument | null> {
    try {
      return await this.json<PageDocument>(`/pages/${id}`);
    } catch {
      return null;
    }
  }

  async getByUrl(url: string): Promise<PageDocument | null> {
    try {
      return await this.json<PageDocument>(
        `/pages/by-url?url=${encodeURIComponent(url)}`,
      );
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<CollectionDefinition[]> {
    return await this.json<CollectionDefinition[]>("/collections");
  }

  async records(
    collectionKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    return await this.json(
      `/collections/${encodeURIComponent(collectionKey)}/records`,
    );
  }

  async recordRows(
    collectionKey: string,
  ): Promise<Array<{ record_key: string; data: Record<string, unknown> }>> {
    return await this.json(
      `/collections/${encodeURIComponent(collectionKey)}/records?keys=true`,
    );
  }

  async save(
    doc: PageDocument,
    ifUpdatedAt: string | null,
  ): Promise<PageDocument> {
    return await this.json<PageDocument>(`/pages/${doc.id}`, {
      method: "PUT",
      headers: ifUpdatedAt ? { [IF_UPDATED_AT]: ifUpdatedAt } : {},
      body: JSON.stringify(doc),
    });
  }

  async delete(id: string): Promise<void> {
    await this.json<void>(`/pages/${id}`, { method: "DELETE" });
  }

  async saveRecord(
    collectionKey: string,
    recordKey: string,
    data: Record<string, unknown>,
    previousKey?: string,
  ): Promise<void> {
    await this.json<void>(
      `/collections/${encodeURIComponent(collectionKey)}/records/${encodeURIComponent(recordKey)}`,
      { method: "PUT", body: JSON.stringify({ data, previousKey }) },
    );
  }

  async deleteRecord(collectionKey: string, recordKey: string): Promise<void> {
    await this.json<void>(
      `/collections/${encodeURIComponent(collectionKey)}/records/${encodeURIComponent(recordKey)}`,
      { method: "DELETE" },
    );
  }
}
