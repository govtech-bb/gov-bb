import type { Category, CategoryBlockers, CategoryFields, CategoryOrder } from "./categories";
import type { paths } from "./openapi";

type Json<Content> = Content extends { content: { "application/json": infer Body } } ? Body : never;

type ApiCategory = Json<paths["/editor/categories"]["get"]["responses"][200]>["categories"][number];

type CreateCategoryInput = Json<paths["/editor/categories"]["post"]["requestBody"]>;

type UpdateCategoryInput = Json<paths["/editor/categories/{id}"]["put"]["requestBody"]>;

type OrderCategoriesInput = Json<paths["/editor/categories/order"]["put"]["requestBody"]>;

type ApiCategoryBlockers = Extract<
  Json<paths["/editor/categories/{id}"]["delete"]["responses"][409]>,
  { error: "category_in_use" }
>["blockers"];

/** A page as the editor reads and saves it. */
export type ApiPage = Json<paths["/pages/{id}"]["get"]["responses"][200]>;

/** What creating a page sends. */
export type CreatePageInput = Json<paths["/pages"]["post"]["requestBody"]>;

/** What saving a page sends: every field, with `parent_id` left out to keep the parent. */
export type SavePageInput = Json<paths["/pages/{id}"]["put"]["requestBody"]>;

/** One row of the services list. */
export type ServiceSummary = Json<paths["/services"]["get"]["responses"][200]>[number];

/** A service opened in the editor: its summary and every page in it. */
export type ServiceDetail = Json<paths["/services/{id}"]["get"]["responses"][200]>;

/** A page of an opened service. */
export type ServicePage = ServiceDetail["pages"][number];

/** The estate's change token. */
export type EstateVersion = Json<paths["/version"]["get"]["responses"][200]>;

/** A field the API refused, and what the editor can do about it. */
export type FieldError = Json<paths["/pages"]["post"]["responses"][422]>["errors"][number];

type FailureBody = { message?: string; errors?: FieldError[] };

/** A request the API refused or never answered: status 0 means it was not reached. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly FieldError[] = [],
    message = status === 0 ? "The content API could not be reached" : `HTTP ${status}`,
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

  constructor(status: number, message?: string) {
    super(status, [], message ?? `Category request refused: HTTP ${status}`);
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
const isText = (value: unknown): value is string => String(value) === value;

const isFlag = (value: unknown): value is boolean => value === true || value === false;

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isId = (value: unknown): value is string => isText(value) && UUID.test(value);

// A version as the content API stamps it: an ISO instant to the millisecond
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})$/;

const isStamp = (value: unknown): value is string =>
  isText(value) && STAMP.test(value) && Number.isFinite(Date.parse(value));

const isCategory = (value: unknown): value is ApiCategory =>
  value instanceof Object &&
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
  isStamp(value.updated_at);

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
    body?: CreatePageInput | SavePageInput | CategoryFields | CategoryOrder,
    ifUpdatedAt?: string,
  ) {
    const headers = new Headers();

    const init: RequestInit = { method, headers, credentials: "include", cache: "no-store" };

    // Fastify refuses a JSON content type on a request with no body.
    if (body) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    if (ifUpdatedAt) headers.set("if-updated-at", ifUpdatedAt);

    try {
      return await fetch(`${apiOrigin}${path}`, init);
    } catch {
      throw new ApiFailure(0);
    }
  }

  const refused = (status: number, failure: FailureBody | null | undefined) =>
    new ApiFailure(status, failure?.errors, failure?.message);

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

    if (status === 401 || status === 403)
      return new CategoryAccessDenied(status, message ?? `Category access denied: HTTP ${status}`);

    if (status === 404) return new CategoryNotFound(message ?? "Category not found");

    if (status === 422 && errors) return new CategoryRejected(errors, message ?? "Not saved");

    if (status === 409 && message && failure instanceof Object && "error" in failure) {
      if (failure.error === "conflict") return new CategoryConflict(message);

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

  return {
    services,
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
    /** Saves a category's fields over the version last read, `ifUpdatedAt`; moved to a new parent, it goes last. */
    updateCategory: async (id: string, fields: CategoryFields, ifUpdatedAt: string) => {
      const written = await writeCategory(
        "update",
        ["CategoryAccessDenied", "CategoryNotFound", "CategoryRejected", "CategoryConflict"],
        "PUT",
        `/editor/categories/${id}`,
        fields satisfies UpdateCategoryInput,
        ifUpdatedAt,
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
        order satisfies OrderCategoriesInput,
      );

      if (!written.ok) return written;
      const saved = await bodyOf(written.value);

      return isCategoryList(saved)
        ? ok<Category[]>(saved.categories)
        : failed(new CategoryOutcomeUnknown("order", new CategoryAnswerMalformed()));
    },
    /** Deletes a category nothing uses, at the version last read, `ifUpdatedAt`. */
    deleteCategory: async (id: string, ifUpdatedAt: string) => {
      const written = await writeCategory(
        "delete",
        ["CategoryAccessDenied", "CategoryNotFound", "CategoryConflict", "CategoryInUse"],
        "DELETE",
        `/editor/categories/${id}`,
        undefined,
        ifUpdatedAt,
      );

      return written.ok ? ok(undefined) : written;
    },
    version: () => read<EstateVersion>("/version"),
    page: (id: string) => read<ApiPage>(`/pages/${id}`),
    createPage: async (page: CreatePageInput): Promise<ApiPage> =>
      (await send("POST", "/pages", page)).json(),
    savePage: async (id: string, fields: SavePageInput, ifUpdatedAt: string): Promise<ApiPage> =>
      (await send("PUT", `/pages/${id}`, fields, ifUpdatedAt)).json(),
    deletePage: async (id: string) => {
      await send("DELETE", `/pages/${id}`);
    },
    landingUrl: (path: string) => (landing ? `${landing}${path}` : undefined),
  };
}
