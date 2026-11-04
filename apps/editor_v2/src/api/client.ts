import type { Category, CategoryBlockers, CategoryFields, CategoryOrder } from "./categories";
import type { paths } from "./openapi";

type Json<Content> = Content extends { content: { "application/json": infer Body } } ? Body : never;

type ApiCategory = Json<paths["/editor/categories"]["get"]["responses"][200]>["categories"][number];

type CreateCategoryInput = Json<paths["/editor/categories"]["post"]["requestBody"]>;

type ApiCategoryBlockers = Extract<
  Json<paths["/editor/categories/{id}"]["delete"]["responses"][409]>,
  { error: "category_in_use" }
>["blockers"];

/** A page as the editor reads and saves it. */
export type ApiPage = Json<paths["/pages/{id}"]["get"]["responses"][200]>;

/** What creating a page sends. */
export type CreatePageInput = Json<paths["/pages"]["post"]["requestBody"]>;

/** What saving a page sends: every field, with `parent_id` left out to keep the parent. */
export type SavePageInput = Omit<
  Json<paths["/pages/{id}"]["put"]["requestBody"]>,
  "expected_version"
>;

/** A public page's change waiting for an approver, with what it changes. */
export type ApiRevision = Json<paths["/pages/{id}/revision"]["get"]["responses"][200]>;

/** A change waiting for an approver, as the review queue lists it. */
export type ReviewQueueEntry = Json<
  paths["/revisions"]["get"]["responses"][200]
>["revisions"][number];

/** One entry in a page's history: what happened, who did it, when, and what it changed. */
export type PageHistoryEntry = Json<
  paths["/pages/{id}/history"]["get"]["responses"][200]
>["entries"][number];

/** What rejecting a change sends: why, for the editor. */

/** One row of the services list. */
export type ServiceSummary = Json<paths["/services"]["get"]["responses"][200]>[number];

/** A service opened in the editor: its summary and every page in it. */
export type ServiceDetail = Json<paths["/services/{id}"]["get"]["responses"][200]>;

/** A page of an opened service. */
export type ServicePage = ServiceDetail["pages"][number];

/** The signed-in employee and their roles. */
export type Me = Json<paths["/editor/me"]["get"]["responses"][200]>;

/** A data collection in the editor's list: its field list and how many records it holds. */
export type CollectionSummary = Json<
  paths["/collections"]["get"]["responses"][200]
>["collections"][number];

/** A data collection and its records, ordered by record key. */
export type CollectionDetail = Json<paths["/collections/{key}/records"]["get"]["responses"][200]>;

/** A collection's definition: its key, title, record key field and field list. */
export type Collection = CollectionDetail["collection"];

/** One record of a collection: a value for some or all of its fields, every one a string. */
export type CollectionRecord = CollectionDetail["records"][number];

/** A private record editing snapshot, including its definition from the same read. */
export type RecordDetail = Json<
  paths["/collections/{key}/records/{recordKey}"]["get"]["responses"][200]
>;

/** What saving a record sends: every value to keep, by field key. */
export type RecordInput = Json<
  paths["/collections/{key}/records/{recordKey}"]["put"]["requestBody"]
>;

/** What creating a record sends: its values, against the displayed definition version. */
type CreateRecordInput = Json<
  paths["/collections/{key}/records/{recordKey}"]["post"]["requestBody"]
>;

/** The estate's change token. */
export type EstateVersion = Json<paths["/version"]["get"]["responses"][200]>;

/** A field the API refused, and what the editor can do about it. */
export type FieldError = Json<paths["/pages"]["post"]["responses"][422]>["errors"][number];

type FailureBody = { error?: string; message?: string; errors?: FieldError[] };

/** A request the API refused or never answered; status 0 does not prove a write failed. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly FieldError[] = [],
    message = status === 0 ? "The content API could not be reached" : `HTTP ${status}`,
    /** The API's `error`, which tells refusals with one status apart. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A category operation's outcome: what it read or saved, or the known reason it didn't. */
export type CategoryResult<Value, Failure extends Error> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure };

/** A category read that got no answer from the content API; nothing changed. */
export class CategoryUnreachable extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryUnreachable" as const;

  constructor() {
    super(0, [], "Category list unreachable: the content API could not be reached");
  }
}

/** The session has ended (401), or the signed-in person may not manage categories (403). */
export class CategoryAccessDenied extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryAccessDenied" as const;

  /** `message` is the content API's reason, or empty when it gave none, for a screen to say in its own words. */
  constructor(
    override readonly status: 401 | 403,
    message: string,
  ) {
    super(status, [], message);
  }
}

/** The category to change or delete no longer exists, such as after another author deleted it. */
export class CategoryNotFound extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryNotFound" as const;

  constructor(message: string) {
    super(404, [], message);
  }
}

/** Fields the content API refused, each with the reason an author can act on. */
export class CategoryRejected extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryRejected" as const;

  constructor(errors: readonly FieldError[], message: string) {
    super(422, errors, message);
  }
}

/** A category save, move or deletion refused because another author changed the categories first: read them again. */
export class CategoryConflict extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryConflict" as const;

  /** `message` is the content API's own sentence. */
  constructor(message: string) {
    super(409, [], message);
  }
}

/** A category deletion refused because pages, subcategories or an app route still use the category. */
export class CategoryInUse extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryInUse" as const;

  /** `blockers` counts pages of every status, not only the services the list shows. */
  constructor(
    message: string,
    readonly blockers: CategoryBlockers,
  ) {
    super(409, [], message);
  }
}

/**
 * Any other refusal: a request the content API couldn't read (400), a read's failure on the API's side (5xx), or an
 * answer outside the operation's contract. A write's 5xx is never this: it may follow a commit, so its outcome is
 * unknown.
 */
export class CategoryRefused extends ApiFailure {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryRefused" as const;

  /** `message` is the content API's own sentence, or empty when it gave none, for a screen to say in its own words. */
  constructor(status: number, message?: string) {
    super(status, [], message ?? "");
  }
}

/** The content API's answer isn't the category, or list of categories, its contract promises. */
export class CategoryAnswerMalformed extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryAnswerMalformed" as const;

  constructor() {
    super("Category answer malformed: the content API's answer is not the categories it promises");
  }
}

/**
 * A category write whose outcome is unknown: it may have reached the content API, but no answer, or none that could
 * be read, came back. Nothing says it failed, so it is never repeated blindly: read the categories again and compare.
 */
export class CategoryOutcomeUnknown extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryOutcomeUnknown" as const;

  /** `cause` is the lost request's error, or the unreadable answer's. */
  constructor(
    readonly operation: "create" | "update" | "order" | "delete",
    cause: unknown,
  ) {
    super(
      `Category ${operation} outcome unknown: the content API's answer was lost or unreadable`,
      {
        cause,
      },
    );
  }
}

/** Why the content API refused a category request that it answered. */
export type CategoryRefusal =
  | CategoryAccessDenied
  | CategoryNotFound
  | CategoryRejected
  | CategoryConflict
  | CategoryInUse
  | CategoryRefused;

// A refusal the operation's contract names, or else one outside it
type Within<Tag extends CategoryRefusal["_tag"]> = Extract<CategoryRefusal, { _tag: Tag }>;

const isWithin = <Tag extends CategoryRefusal["_tag"]>(
  refusal: CategoryRefusal,
  tags: readonly Tag[],
): refusal is Within<Tag> => tags.some((tag) => tag === refusal._tag);

const ok = <Value>(value: Value) => ({ ok: true, value }) as const;

const failed = <Failure extends Error>(error: Failure) => ({ ok: false, error }) as const;

// JSON's text: any other JSON value, even a number, reads as something different
export const isText = (value: unknown): value is string => String(value) === value;

const isFlag = (value: unknown): value is boolean => value === true || value === false;

/** Edit versions are positive integers exactly representable by JavaScript. */
export const isEditVersion = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isId = (value: unknown): value is string => isText(value) && UUID.test(value);

// A version as the content API stamps it: an ISO instant to the millisecond
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})$/;

const isStamp = (value: unknown): value is string =>
  isText(value) && STAMP.test(value) && Number.isFinite(Date.parse(value));

const isLastEditedBy = (value: unknown): value is ApiPage["last_edited_by"] =>
  value === null ||
  (value instanceof Object &&
    "id" in value &&
    isText(value.id) &&
    "name" in value &&
    (value.name === null || isText(value.name)));

const isCategory = (value: unknown): value is ApiCategory =>
  value instanceof Object &&
  "version" in value &&
  isEditVersion(value.version) &&
  "id" in value &&
  isId(value.id) &&
  "parent_id" in value &&
  (value.parent_id === null || isId(value.parent_id)) &&
  "title" in value &&
  isText(value.title) &&
  "slug" in value &&
  isText(value.slug) &&
  "description" in value &&
  (value.description === null || isText(value.description)) &&
  "url" in value &&
  isText(value.url) &&
  value.url.startsWith("/") &&
  "position" in value &&
  isCount(value.position) &&
  "services" in value &&
  isCount(value.services) &&
  "reserved_route" in value &&
  isFlag(value.reserved_route) &&
  "updated_at" in value &&
  isStamp(value.updated_at) &&
  "last_edited_by" in value &&
  isLastEditedBy(value.last_edited_by);

const isCategoryList = (value: unknown): value is { categories: ApiCategory[] } =>
  value instanceof Object &&
  "categories" in value &&
  Array.isArray(value.categories) &&
  value.categories.every(isCategory);

const isFieldErrors = (value: unknown): value is FieldError[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item instanceof Object &&
      "field" in item &&
      isText(item.field) &&
      "message" in item &&
      isText(item.message),
  );

const isCategoryBlockers = (value: unknown): value is ApiCategoryBlockers =>
  value instanceof Object &&
  "pages" in value &&
  isCount(value.pages) &&
  "subcategories" in value &&
  isCount(value.subcategories) &&
  "reserved_route" in value &&
  isFlag(value.reserved_route);

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Untrusted JSON object at the HTTP boundary; each consumed field is checked below.
const isObject = (value: unknown): value is Record<string, unknown> =>
  value instanceof Object && !Array.isArray(value);

const nullableText = (value: unknown): value is string | null => value === null || isText(value);

const isPageFields = (value: unknown): value is SavePageInput & { parent_id: string | null } =>
  isObject(value) &&
  isText(value.url) &&
  isText(value.title) &&
  nullableText(value.category_id) &&
  nullableText(value.parent_id) &&
  nullableText(value.description) &&
  nullableText(value.form_id) &&
  ["public", "preview", "draft"].includes(String(value.visibility)) &&
  isText(value.body_markdown) &&
  isObject(value.frontmatter);

const isPage = (value: unknown): value is ApiPage =>
  isObject(value) &&
  isText(value.id) &&
  isText(value.slug) &&
  isEditVersion(value.version) &&
  isStamp(value.updated_at) &&
  isStamp(value.created_at) &&
  (value.published_at === null || isStamp(value.published_at)) &&
  isLastEditedBy(value.last_edited_by) &&
  (value.pending_revision === null ||
    (isObject(value.pending_revision) &&
      ["draft", "submitted", "rejected"].includes(String(value.pending_revision.status)) &&
      nullableText(value.pending_revision.comment))) &&
  isPageFields(value);

const isRevision = (value: unknown): value is ApiRevision =>
  isObject(value) &&
  isEditVersion(value.version) &&
  isText(value.id) &&
  isText(value.page_id) &&
  isPageFields(value.fields) &&
  ["draft", "submitted", "rejected", "published", "discarded"].includes(String(value.status)) &&
  nullableText(value.comment) &&
  isStamp(value.updated_at) &&
  Array.isArray(value.contributors) &&
  value.contributors.every(isText) &&
  Array.isArray(value.changes) &&
  value.changes.every(
    (change) =>
      isObject(change) && isText(change.field) && "live" in change && "proposed" in change,
  );

const isEditorCollection = (value: unknown): value is RecordDetail["collection"] =>
  isObject(value) &&
  isText(value.key) &&
  isText(value.title) &&
  isText(value.record_key) &&
  isObject(value.schema) &&
  Array.isArray(value.schema.fields) &&
  value.schema.fields.every(
    (field) =>
      isObject(field) &&
      isText(field.key) &&
      isText(field.label) &&
      ["text", "slug", "email"].includes(String(field.type)),
  );

const isEditorRecord = (value: unknown): value is RecordDetail["record"] =>
  isObject(value) &&
  isEditVersion(value.version) &&
  isText(value.record_key) &&
  isStamp(value.updated_at) &&
  isObject(value.data) &&
  Object.values(value.data).every(isText);

const isRecordDetail = (value: unknown): value is RecordDetail =>
  isObject(value) && isEditorCollection(value.collection) && isEditorRecord(value.record);

/** An unreadable successful write cannot confirm a baseline; keep the submitted request for retry. */
export class ApiAnswerMalformed extends Error {
  constructor() {
    super("Content API answer is incomplete. Keep your changes and check the saved version.");
  }
}

/** Network loss, server errors and unusable success replies can all follow a committed write. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch-boundary classification; arbitrary thrown values are not confirmed API refusals.
export const outcomeUnknown = (error: unknown) =>
  error instanceof ApiAnswerMalformed ||
  (error instanceof ApiFailure && (error.status === 0 || error.status >= 500));

async function checkedReply<Body>(response: Response, valid: (value: unknown) => value is Body) {
  const body: unknown = await response.json().catch(() => undefined);

  if (!valid(body)) throw new ApiAnswerMalformed();

  return body;
}

// The body of an answer, or undefined when it isn't JSON or was cut off
const bodyOf = async (response: Response) => response.json().catch(() => undefined);

export type EditorApi = ReturnType<typeof createEditorApi>;

/** api_v2's editor routes, sent with the employee session cookie. */
export function createEditorApi(apiOrigin: string, landingOrigin?: string) {
  const landing = landingOrigin ? new URL(landingOrigin).origin : undefined;

  // Any answer the API gives; only a request that got none fails
  async function request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?:
      | CreatePageInput
      | SavePageInput
      | CategoryFields
      | CategoryOrder
      | RecordInput
      | CreateRecordInput
      | { expected_version: number; comment?: string },
  ) {
    const headers = new Headers();

    const init: RequestInit = { method, headers, credentials: "include", cache: "no-store" };

    // Fastify refuses a JSON content type on a request with no body.
    if (body) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    try {
      return await fetch(`${apiOrigin}${path}`, init);
    } catch {
      throw new ApiFailure(0);
    }
  }

  const refused = (status: number, failure: FailureBody | null | undefined) =>
    new ApiFailure(status, failure?.errors, failure?.message, failure?.error);

  async function send(...args: Parameters<typeof request>) {
    const response = await request(...args);

    if (response.ok) return response;
    throw refused(response.status, await bodyOf(response));
  }

  // A category refusal by its status, a 409 told apart by the content API's required `error`
  async function categoryRefusal(response: Response): Promise<CategoryRefusal> {
    const failure = await bodyOf(response);

    const message =
      failure instanceof Object && "message" in failure && isText(failure.message)
        ? failure.message
        : undefined;

    const errors =
      failure instanceof Object && "errors" in failure && isFieldErrors(failure.errors)
        ? failure.errors
        : undefined;

    const status = response.status;

    if (status === 401 || status === 403) return new CategoryAccessDenied(status, message ?? "");

    if (status === 404) return new CategoryNotFound(message ?? "Category not found");

    if (status === 422 && errors) return new CategoryRejected(errors, message ?? "Not saved");

    if (status === 409 && message && failure instanceof Object && "error" in failure) {
      if (failure.error === "version_conflict") return new CategoryConflict(message);

      if (
        failure.error === "category_in_use" &&
        "blockers" in failure &&
        isCategoryBlockers(failure.blockers)
      )
        return new CategoryInUse(message, failure.blockers);
    }

    return new CategoryRefused(status, message);
  }

  // A category write's answer, or the refusal its contract names; with no answer, its outcome is unknown
  async function writeCategory<Tag extends CategoryRefusal["_tag"]>(
    operation: CategoryOutcomeUnknown["operation"],
    expected: readonly Tag[],
    ...args: Parameters<typeof request>
  ): Promise<CategoryResult<Response, Within<Tag> | CategoryRefused | CategoryOutcomeUnknown>> {
    let response: Response;

    try {
      response = await request(...args);
    } catch (error) {
      return failed(new CategoryOutcomeUnknown(operation, error));
    }

    if (response.ok) return ok(response);
    const refusal = await categoryRefusal(response);

    // A gateway or server failure can follow a committed write, so it proves nothing failed
    if (response.status >= 500) return failed(new CategoryOutcomeUnknown(operation, refusal));

    return failed(
      isWithin(refusal, expected) ? refusal : new CategoryRefused(refusal.status, refusal.message),
    );
  }

  // The category a create or an update saved, as the API read it back; unreadable, its outcome is unknown
  async function savedCategory(operation: "create" | "update", response: Response) {
    const saved = await bodyOf(response);

    return isCategory(saved)
      ? ok<Category>(saved)
      : failed(new CategoryOutcomeUnknown(operation, new CategoryAnswerMalformed()));
  }

  const read = async <Body>(path: string): Promise<Body> => (await send("GET", path)).json();

  const services = () => read<ServiceSummary[]>("/services");

  const recordPath = (key: string, recordKey: string) =>
    `/collections/${encodeURIComponent(key)}/records/${encodeURIComponent(recordKey)}`;

  return {
    services,
    pagePaths: () =>
      read<Json<paths["/editor/page-paths"]["get"]["responses"][200]>>("/editor/page-paths"),
    service: (id: string) => read<ServiceDetail>(`/services/${id}`),
    /** The one shared category list: each top-level category, then its subcategories, in their order. */
    categories: async (): Promise<
      CategoryResult<
        Category[],
        CategoryUnreachable | CategoryAccessDenied | CategoryRefused | CategoryAnswerMalformed
      >
    > => {
      let response: Response;

      try {
        response = await request("GET", "/editor/categories");
      } catch {
        return failed(new CategoryUnreachable());
      }

      if (!response.ok) {
        const refusal = await categoryRefusal(response);

        return failed(
          refusal._tag === "CategoryAccessDenied"
            ? refusal
            : new CategoryRefused(refusal.status, refusal.message),
        );
      }

      const list = await bodyOf(response);

      return isCategoryList(list) ? ok(list.categories) : failed(new CategoryAnswerMalformed());
    },
    /** Adds a category at the end of its parent's subcategories, or of the top level. */
    createCategory: async (fields: CategoryFields) => {
      const written = await writeCategory(
        "create",
        ["CategoryAccessDenied", "CategoryRejected"],
        "POST",
        "/editor/categories",
        fields satisfies CreateCategoryInput,
      );

      return written.ok ? savedCategory("create", written.value) : written;
    },
    /** Saves the fields against the category version displayed when editing began. */
    updateCategory: async (id: string, fields: CategoryFields, expectedVersion: number) => {
      const written = await writeCategory(
        "update",
        ["CategoryAccessDenied", "CategoryNotFound", "CategoryRejected", "CategoryConflict"],
        "PUT",
        `/editor/categories/${id}`,
        { ...fields, expected_version: expectedVersion },
      );

      return written.ok ? savedCategory("update", written.value) : written;
    },
    /** Puts one whole sibling group in a new order, if none of its siblings changed since they were read. */
    orderCategories: async (order: CategoryOrder) => {
      const written = await writeCategory(
        "order",
        ["CategoryAccessDenied", "CategoryRejected", "CategoryConflict"],
        "PUT",
        "/editor/categories/order",
        order,
      );

      if (!written.ok) return written;
      const saved = await bodyOf(written.value);

      return isCategoryList(saved)
        ? ok<Category[]>(saved.categories)
        : failed(new CategoryOutcomeUnknown("order", new CategoryAnswerMalformed()));
    },
    /** Deletes an unused category at the version displayed in the confirmation. */
    deleteCategory: async (id: string, expectedVersion: number) => {
      const written = await writeCategory(
        "delete",
        ["CategoryAccessDenied", "CategoryNotFound", "CategoryConflict", "CategoryInUse"],
        "DELETE",
        `/editor/categories/${id}?expected_version=${expectedVersion}`,
      );

      return written.ok ? ok(undefined) : written;
    },
    /** Every data collection, with its field list and record count. */
    collections: async () =>
      (await read<{ collections: CollectionSummary[] }>("/collections")).collections,
    /** A collection and its records; a 404 when there is no such collection. */
    collection: (key: string) =>
      read<CollectionDetail>(`/collections/${encodeURIComponent(key)}/records`),
    /** A private editing snapshot: the record's version and the definition its form uses. */
    record: async (key: string, recordKey: string) =>
      checkedReply(await send("GET", recordPath(key, recordKey)), isRecordDetail),
    /** Adds a record. */
    createRecord: async (key: string, recordKey: string, data: RecordInput["data"]) =>
      checkedReply(await send("POST", recordPath(key, recordKey), { data }), isEditorRecord),
    /** Replaces a record only if its displayed version still matches. */
    saveRecord: async (
      key: string,
      recordKey: string,
      data: RecordInput["data"],
      expectedVersion: number,
    ) =>
      checkedReply(
        await send("PUT", recordPath(key, recordKey), { data, expected_version: expectedVersion }),
        isRecordDetail,
      ),
    /** Deletes the record displayed in the confirmation, never a replacement at the same key. */
    deleteRecord: async (key: string, recordKey: string, expectedVersion: number) => {
      await send("DELETE", `${recordPath(key, recordKey)}?expected_version=${expectedVersion}`);
    },
    version: () => read<EstateVersion>("/version"),
    me: () => read<Me>("/editor/me"),
    page: async (id: string) => checkedReply(await send("GET", `/pages/${id}`), isPage),
    createPage: async (page: CreatePageInput) =>
      checkedReply(await send("POST", "/pages", page), isPage),
    savePage: async (id: string, fields: SavePageInput, expectedVersion: number) =>
      checkedReply(
        await send("PUT", `/pages/${id}`, { ...fields, expected_version: expectedVersion }),
        isPage,
      ),
    submitRevision: async (id: string, expectedVersion: number) => {
      const revision = await checkedReply(
        await send("POST", `/pages/${id}/revision/submit`, { expected_version: expectedVersion }),
        isRevision,
      );

      if (revision.status !== "submitted") throw new ApiAnswerMalformed();

      return { ...revision, status: revision.status };
    },
    /** The changes waiting for an approver, the longest-waiting first. */
    reviewQueue: async () =>
      (await read<{ revisions: ReviewQueueEntry[] }>("/revisions?status=submitted")).revisions,
    revision: async (id: string) =>
      checkedReply(await send("GET", `/pages/${id}/revision`), isRevision),
    /** What happened to a page, newest first. */
    history: async (id: string) =>
      (await read<{ entries: PageHistoryEntry[] }>(`/pages/${id}/history`)).entries,
    /** Publishes exactly the version the approver reviewed. */
    publishRevision: async (id: string, expectedVersion: number) =>
      checkedReply(
        await send("POST", `/pages/${id}/revision/publish`, { expected_version: expectedVersion }),
        isPage,
      ),
    /** Rejects the displayed change with the submitted comment. */
    rejectRevision: async (id: string, comment: string, expectedVersion: number) =>
      checkedReply(
        await send("POST", `/pages/${id}/revision/reject`, {
          comment,
          expected_version: expectedVersion,
        }),
        isRevision,
      ),
    deletePage: async (id: string, expectedVersion: number) => {
      await send("DELETE", `/pages/${id}?expected_version=${expectedVersion}`);
    },
    landingUrl: (path: string) => (landing ? `${landing}${path}` : undefined),
  };
}
