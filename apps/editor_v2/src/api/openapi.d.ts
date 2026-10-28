// Generated from apps/api_v2/openapi.json by src/api/openapi.test.ts.
// Regenerate with `pnpm exec vitest run src/api/openapi.test.ts -u`.

export interface paths {
    "/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a public page by its url
         * @description The site's read. A page is served only when it and every page above it (by `parent_id`) are visible: public, or preview too with the preview token. `hide_start_links` is set when the page's `start` sub-page is not. A bare `/<slug>` with no page of its own redirects (301) to the one visible page with that slug.
         */
        get: {
            parameters: {
                query: {
                    url: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            url: string;
                            /** @description The stored frontmatter, with the page's title and description (columns of their own) put back. */
                            frontmatter: {
                                lede?: string;
                                stage?: string;
                                featured?: boolean;
                                section?: string;
                                service_type?: string;
                                keywords?: string[];
                                source_url?: string;
                                title: string;
                                description?: string;
                            };
                            /** @description The page body as written. The site sanitises and renders it. */
                            body_markdown: string;
                            /** @description The form a Start link with no href of its own opens, or null. Whether the form is open is the forms API's to say. */
                            form_id: string | null;
                            /** @description True when the page's `start` sub-page is hidden from this viewer: the site removes the Start link and counts "There are N ways…" down. */
                            hide_start_links: boolean;
                            /** @description The full trail, current page included, Home not: the category (and its parent, for a subcategory), then the pages above this one. */
                            breadcrumbs: {
                                name: string;
                                url: string;
                            }[];
                            /**
                             * Format: date-time
                             * @description When the page first went public (seeded from landing's `publish_date`); null until it has.
                             */
                            published_at: string | null;
                            /**
                             * Format: date-time
                             * @description The page's last save, visibility changes included: the site's "Last updated" line.
                             */
                            updated_at: string;
                        };
                    };
                };
                /** @description Default Response */
                301: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            redirect: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Create a page
         * @description Requires an employee session, the editor's Origin header and the editor role (403 otherwise). Creating a page as `public` needs the approver role (403 otherwise).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The site's routing key. */
                        url: string;
                        /** Format: uuid */
                        category_id?: string | null;
                        /**
                         * Format: uuid
                         * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                         */
                        parent_id?: string | null;
                        title: string;
                        description?: string | null;
                        /** @enum {string} */
                        visibility?: "public" | "preview" | "draft";
                        form_id?: string | null;
                        body_markdown: string;
                        frontmatter?: {
                            lede?: string;
                            stage?: string;
                            featured?: boolean;
                            section?: string;
                            service_type?: string;
                            keywords?: string[];
                            source_url?: string;
                        };
                        /** Format: uuid */
                        id?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The site's routing key. */
                            url: string;
                            /** Format: uuid */
                            category_id: string | null;
                            /**
                             * Format: uuid
                             * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                             */
                            parent_id: string | null;
                            title: string;
                            description: string | null;
                            /** @enum {string} */
                            visibility: "public" | "preview" | "draft";
                            form_id: string | null;
                            body_markdown: string;
                            frontmatter: {
                                lede?: string;
                                stage?: string;
                                featured?: boolean;
                                section?: string;
                                service_type?: string;
                                keywords?: string[];
                                source_url?: string;
                            };
                            /** Format: uuid */
                            id: string;
                            /** @description The url's last segment. */
                            slug: string;
                            /**
                             * Format: date-time
                             * @description When the page first went public; null until it has.
                             */
                            published_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Millisecond precision, and exactly the value to send back in `if-updated-at` on the next save.
                             */
                            updated_at: string;
                            /** @description Set when the page is public and has a change waiting for an approver, or a rejected one that has not been replaced. The fields and `updated_at` are then the revision's, and citizens still see the live page. */
                            pending_revision: {
                                /** @enum {string} */
                                status: "draft" | "submitted" | "rejected";
                                /** @description Why an approver rejected it; null unless rejected. */
                                comment: string | null;
                            } | null;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message?: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The categories the site lists
         * @description In order, each with its subcategories. A category is listed when it or one of its subcategories has a visible page at its root.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            categories: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                                subcategories: {
                                    slug: string;
                                    /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                    url: string;
                                    title: string;
                                    description: string | null;
                                }[];
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/categories/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A category and what it lists
         * @description Its subcategories and the visible pages at its root. 404 when it lists nothing.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            category: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            };
                            /** @description The category this is a subcategory of, or null. */
                            parent: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            } | null;
                            /** @description Those with something to list, in order. */
                            subcategories: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            }[];
                            /** @description The pages at the category's root, A to Z. */
                            pages: {
                                url: string;
                                title: string;
                                description: string | null;
                                /** @description It has a form, or its frontmatter says it is digital. */
                                digital: boolean;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/categories/{category}/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A subcategory and what it lists */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    category: string;
                    slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            category: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            };
                            /** @description The category this is a subcategory of, or null. */
                            parent: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            } | null;
                            /** @description Those with something to list, in order. */
                            subcategories: {
                                slug: string;
                                /** @description `/<category>`, or `/<category>/<subcategory>`. */
                                url: string;
                                title: string;
                                description: string | null;
                            }[];
                            /** @description The pages at the category's root, A to Z. */
                            pages: {
                                url: string;
                                title: string;
                                description: string | null;
                                /** @description It has a form, or its frontmatter says it is digital. */
                                digital: boolean;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every visible page
         * @description Sub-pages included, `start` steps not, A to Z: for the sitemap and service lists.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pages: {
                                url: string;
                                title: string;
                                description: string | null;
                                /** @description It has a form, or its frontmatter says it is digital. */
                                digital: boolean;
                                stage: string | null;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What search indexes
         * @description Every page the catalog lists, with its keywords and its body as plain-text chunks.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            documents: {
                                url: string;
                                title: string;
                                description: string | null;
                                /** @description It has a form, or its frontmatter says it is digital. */
                                digital: boolean;
                                keywords: string[];
                                /** @description The body as plain text, split at its headings, in order. Joined with spaces (heading, then body, skipping empties) they are the whole body's text. */
                                chunks: {
                                    heading: string | null;
                                    body: string;
                                }[];
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a page by id
         * @description The editor's read: any visibility, markdown included. A public page with a pending revision is read with the revision laid over it.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The site's routing key. */
                            url: string;
                            /** Format: uuid */
                            category_id: string | null;
                            /**
                             * Format: uuid
                             * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                             */
                            parent_id: string | null;
                            title: string;
                            description: string | null;
                            /** @enum {string} */
                            visibility: "public" | "preview" | "draft";
                            form_id: string | null;
                            body_markdown: string;
                            frontmatter: {
                                lede?: string;
                                stage?: string;
                                featured?: boolean;
                                section?: string;
                                service_type?: string;
                                keywords?: string[];
                                source_url?: string;
                            };
                            /** Format: uuid */
                            id: string;
                            /** @description The url's last segment. */
                            slug: string;
                            /**
                             * Format: date-time
                             * @description When the page first went public; null until it has.
                             */
                            published_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Millisecond precision, and exactly the value to send back in `if-updated-at` on the next save.
                             */
                            updated_at: string;
                            /** @description Set when the page is public and has a change waiting for an approver, or a rejected one that has not been replaced. The fields and `updated_at` are then the revision's, and citizens still see the live page. */
                            pending_revision: {
                                /** @enum {string} */
                                status: "draft" | "submitted" | "rejected";
                                /** @description Why an approver rejected it; null unless rejected. */
                                comment: string | null;
                            } | null;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        /**
         * Save a page
         * @description Requires an employee session, the editor's Origin header and the editor role (403 otherwise). Send every field: a save replaces the page and defaults none, except that leaving `parent_id` out keeps the page's parent. Send the `updated_at` you last read in the `if-updated-at` header. If the stored row, or the page's pending revision, has moved on since, the save is refused with a 409 rather than silently discarding whoever wrote first. Changing `url` moves this page alone: its sub-pages keep their urls and stay beneath it by `parent_id`, and nothing redirects from the old url. Changing `visibility` needs the approver role (403 otherwise). A save that keeps a `public` page public, whoever sends it, goes into the page's pending revision: citizens keep seeing the live page until an approver publishes it. An approver's save that takes a `public` page out of public view changes only its `visibility`: the other fields sent are ignored, the live content stays, and a draft revision is discarded. Returns the page as the editor now works on it. A save to a page whose revision is waiting for review is refused (409 `under_review`) until an approver publishes or rejects it.
         */
        put: {
            parameters: {
                query?: never;
                header?: {
                    /** @description The `updated_at` this client last read. Omit to accept whatever is stored. */
                    "if-updated-at"?: string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The site's routing key. */
                        url: string;
                        /** Format: uuid */
                        category_id: string | null;
                        /**
                         * Format: uuid
                         * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                         */
                        parent_id?: string | null;
                        title: string;
                        description: string | null;
                        /** @enum {string} */
                        visibility: "public" | "preview" | "draft";
                        form_id: string | null;
                        body_markdown: string;
                        frontmatter: {
                            lede?: string;
                            stage?: string;
                            featured?: boolean;
                            section?: string;
                            service_type?: string;
                            keywords?: string[];
                            source_url?: string;
                        };
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The site's routing key. */
                            url: string;
                            /** Format: uuid */
                            category_id: string | null;
                            /**
                             * Format: uuid
                             * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                             */
                            parent_id: string | null;
                            title: string;
                            description: string | null;
                            /** @enum {string} */
                            visibility: "public" | "preview" | "draft";
                            form_id: string | null;
                            body_markdown: string;
                            frontmatter: {
                                lede?: string;
                                stage?: string;
                                featured?: boolean;
                                section?: string;
                                service_type?: string;
                                keywords?: string[];
                                source_url?: string;
                            };
                            /** Format: uuid */
                            id: string;
                            /** @description The url's last segment. */
                            slug: string;
                            /**
                             * Format: date-time
                             * @description When the page first went public; null until it has.
                             */
                            published_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Millisecond precision, and exactly the value to send back in `if-updated-at` on the next save.
                             */
                            updated_at: string;
                            /** @description Set when the page is public and has a change waiting for an approver, or a rejected one that has not been replaced. The fields and `updated_at` are then the revision's, and citizens still see the live page. */
                            pending_revision: {
                                /** @enum {string} */
                                status: "draft" | "submitted" | "rejected";
                                /** @description Why an approver rejected it; null unless rejected. */
                                comment: string | null;
                            } | null;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                            /** Format: uuid */
                            documentId: string;
                        } & {
                            [key: string]: unknown;
                        }) | {
                            /** @enum {string} */
                            error: "under_review" | "not_submitted";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message?: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete a page
         * @description Requires an employee session, the editor's Origin header and the editor role (403 otherwise). A page with sub-pages is refused (422) until they are moved or deleted. Deleting a `public` page needs the approver role (403 otherwise). Its pending revision goes with it.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message?: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}/revision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a page's pending revision
         * @description The change to a `public` page that is waiting for an approver: a draft, or one submitted for review. A rejected one is returned until a save starts a new draft, or the live page changes. `changes` lists the fields it changes against the live page. 404 when the page has none.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            page_id: string;
                            /** @enum {string} */
                            status: "draft" | "submitted" | "rejected" | "published";
                            /** @description The page as the change would make it. */
                            fields: {
                                /** @description The site's routing key. */
                                url: string;
                                /** Format: uuid */
                                category_id: string | null;
                                /**
                                 * Format: uuid
                                 * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                                 */
                                parent_id: string | null;
                                title: string;
                                description: string | null;
                                /** @enum {string} */
                                visibility: "public" | "preview" | "draft";
                                form_id: string | null;
                                body_markdown: string;
                                frontmatter: {
                                    lede?: string;
                                    stage?: string;
                                    featured?: boolean;
                                    section?: string;
                                    service_type?: string;
                                    keywords?: string[];
                                    source_url?: string;
                                };
                            };
                            /**
                             * Format: date-time
                             * @description The live page's `updated_at` this revision was last saved over.
                             */
                            live_updated_at: string;
                            /** @description The user id of whoever started it. */
                            created_by: string;
                            /** @description The user id of everyone who saved to it, and of whoever submitted an earlier, rejected round of it; none of them may approve it. */
                            contributors: string[];
                            /** @description The user id of whoever submitted it for review. */
                            submitted_by: string | null;
                            /** Format: date-time */
                            submitted_at: string | null;
                            /** @description The user id of the approver who rejected or published it. */
                            decided_by: string | null;
                            /** Format: date-time */
                            decided_at: string | null;
                            /** @description Why the approver rejected it. */
                            comment: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Moves when its content is saved, not when it is submitted or rejected. Send it in `if-updated-at` to act on this version.
                             */
                            updated_at: string;
                            /** @description The fields whose proposed value differs from the live page's, in field order. Empty when the revision matches the live page. */
                            changes: {
                                /** @enum {string} */
                                field: "url" | "category_id" | "parent_id" | "title" | "description" | "visibility" | "form_id" | "body_markdown" | "frontmatter";
                                live: unknown;
                                proposed: unknown;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List services
         * @description The editor's index, ordered by title. A categorised page at the root of its category is an entry, and every page beneath it by `parent_id` belongs to it.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /**
                             * Format: uuid
                             * @description The entry page's id.
                             */
                            id: string;
                            url: string;
                            title: string;
                            category: {
                                slug: string;
                                title: string;
                            };
                            /** @enum {string} */
                            visibility: "public" | "preview" | "draft";
                            /** @description The entry page's form, else its `/start` page's. */
                            form_id: string | null;
                            has_start_page: boolean;
                            /** @description The entry page plus every page below it. */
                            page_count: number;
                            /**
                             * Format: date-time
                             * @description The latest change across those pages.
                             */
                            updated_at: string;
                        }[];
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/services/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Open a service
         * @description Its entry page and every page below it by `parent_id`, each before the pages below it. 404 when the page is not a service's entry.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            service: {
                                /**
                                 * Format: uuid
                                 * @description The entry page's id.
                                 */
                                id: string;
                                url: string;
                                title: string;
                                category: {
                                    slug: string;
                                    title: string;
                                };
                                /** @enum {string} */
                                visibility: "public" | "preview" | "draft";
                                /** @description The entry page's form, else its `/start` page's. */
                                form_id: string | null;
                                has_start_page: boolean;
                                /** @description The entry page plus every page below it. */
                                page_count: number;
                                /**
                                 * Format: date-time
                                 * @description The latest change across those pages.
                                 */
                                updated_at: string;
                            };
                            /** @description The entry page, then each page before the pages below it. */
                            pages: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                parent_id: string | null;
                                /** @enum {string} */
                                role: "entry" | "start" | "supporting";
                                url: string;
                                slug: string;
                                title: string;
                                /** @enum {string} */
                                visibility: "public" | "preview" | "draft";
                                form_id: string | null;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Every shared category, including empty categories and private service counts */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            categories: {
                                title: string;
                                slug: string;
                                /** Format: uuid */
                                parent_id: string | null;
                                description: string | null;
                                /** Format: uuid */
                                id: string;
                                url: string;
                                position: number;
                                services: number;
                                reserved_route: boolean;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Append a category or subcategory
         * @description Needs the editor role (403 otherwise).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        title: string;
                        slug: string;
                        /** Format: uuid */
                        parent_id: string | null;
                        description: string | null;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            title: string;
                            slug: string;
                            /** Format: uuid */
                            parent_id: string | null;
                            description: string | null;
                            /** Format: uuid */
                            id: string;
                            url: string;
                            position: number;
                            services: number;
                            reserved_route: boolean;
                            /** Format: date-time */
                            updated_at: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Edit a category using its last-read version
         * @description Needs the editor role (403 otherwise).
         */
        put: {
            parameters: {
                query?: never;
                header: {
                    "if-updated-at": string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        title: string;
                        slug: string;
                        /** Format: uuid */
                        parent_id: string | null;
                        description: string | null;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            title: string;
                            slug: string;
                            /** Format: uuid */
                            parent_id: string | null;
                            description: string | null;
                            /** Format: uuid */
                            id: string;
                            url: string;
                            position: number;
                            services: number;
                            reserved_route: boolean;
                            /** Format: date-time */
                            updated_at: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete an empty, unanchored category using its last-read version
         * @description Needs the editor role (403 otherwise).
         */
        delete: {
            parameters: {
                query?: never;
                header: {
                    "if-updated-at": string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                        } | {
                            /** @enum {string} */
                            error: "category_in_use";
                            message: string;
                            blockers: {
                                pages: number;
                                subcategories: number;
                                reserved_route: boolean;
                            };
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/categories/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Atomically reorder a complete, versioned sibling snapshot
         * @description Needs the editor role (403 otherwise).
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        parent_id: string | null;
                        expected: {
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            updated_at: string;
                        }[];
                        ordered_ids: string[];
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            categories: {
                                title: string;
                                slug: string;
                                /** Format: uuid */
                                parent_id: string | null;
                                description: string | null;
                                /** Format: uuid */
                                id: string;
                                url: string;
                                position: number;
                                services: number;
                                reserved_route: boolean;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/employees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Everyone who has signed in, with their roles
         * @description Needs the admin role (403 otherwise).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            employees: {
                                id: string;
                                email: string;
                                name: string;
                                roles: ("editor" | "approver" | "admin")[];
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/employees/{id}/roles/{role}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Grant an employee a role
         * @description Needs the admin role (403 otherwise). Records the admin as the grantor; a role already held is left as it was. 404 for someone who has never signed in.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    role: "editor" | "approver" | "admin";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        post?: never;
        /**
         * Revoke an employee's role
         * @description Needs the admin role (403 otherwise). It applies to their next request. A role they do not hold is not an error.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    role: "editor" | "approver" | "admin";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/editor/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The signed-in employee and their roles */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            email: string;
                            name: string;
                            roles: ("editor" | "approver" | "admin")[];
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A version token for recorded content changes
         * @description `change_events` records every page and category change. Its count and newest timestamp identify those changes without reading the content.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            count: number;
                            /** Format: date-time */
                            latest: string | null;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}/revision/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit a page's draft revision for review
         * @description Needs the editor role (403 otherwise). Records the submitter, who may not then approve it. 404 when the page has no draft revision; 409 `under_review` when it is already submitted, or `conflict` when the draft has been saved since `if-updated-at`. Saving the page is refused while it waits. A rejected revision can be submitted again as it is: it is copied into a new submitted revision with the same `updated_at`, and the rejected one keeps its comment. The copy's `contributors` gain the rejected round's submitter, who may not approve it either.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description The `updated_at` this client last read for the revision. Omit to accept whatever is stored. */
                    "if-updated-at"?: string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            page_id: string;
                            /** @enum {string} */
                            status: "draft" | "submitted" | "rejected" | "published";
                            /** @description The page as the change would make it. */
                            fields: {
                                /** @description The site's routing key. */
                                url: string;
                                /** Format: uuid */
                                category_id: string | null;
                                /**
                                 * Format: uuid
                                 * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                                 */
                                parent_id: string | null;
                                title: string;
                                description: string | null;
                                /** @enum {string} */
                                visibility: "public" | "preview" | "draft";
                                form_id: string | null;
                                body_markdown: string;
                                frontmatter: {
                                    lede?: string;
                                    stage?: string;
                                    featured?: boolean;
                                    section?: string;
                                    service_type?: string;
                                    keywords?: string[];
                                    source_url?: string;
                                };
                            };
                            /**
                             * Format: date-time
                             * @description The live page's `updated_at` this revision was last saved over.
                             */
                            live_updated_at: string;
                            /** @description The user id of whoever started it. */
                            created_by: string;
                            /** @description The user id of everyone who saved to it, and of whoever submitted an earlier, rejected round of it; none of them may approve it. */
                            contributors: string[];
                            /** @description The user id of whoever submitted it for review. */
                            submitted_by: string | null;
                            /** Format: date-time */
                            submitted_at: string | null;
                            /** @description The user id of the approver who rejected or published it. */
                            decided_by: string | null;
                            /** Format: date-time */
                            decided_at: string | null;
                            /** @description Why the approver rejected it. */
                            comment: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Moves when its content is saved, not when it is submitted or rejected. Send it in `if-updated-at` to act on this version.
                             */
                            updated_at: string;
                            /** @description The fields whose proposed value differs from the live page's, in field order. Empty when the revision matches the live page. */
                            changes: {
                                /** @enum {string} */
                                field: "url" | "category_id" | "parent_id" | "title" | "description" | "visibility" | "form_id" | "body_markdown" | "frontmatter";
                                live: unknown;
                                proposed: unknown;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                            /** Format: uuid */
                            documentId: string;
                        } & {
                            [key: string]: unknown;
                        }) | {
                            /** @enum {string} */
                            error: "under_review" | "not_submitted";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}/revision/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject a submitted revision with a comment
         * @description Needs the approver role, and the approver must not have changed or submitted the revision (403 otherwise). The live page is unchanged; the revision is kept with the comment, and the next save starts a new draft from it. Rejecting moves the revision's `updated_at`, so an editor holding the earlier one reloads and sees why. `if-updated-at` is required (428 without it). 404 when nothing is waiting for review; 409 `not_submitted` for a draft, or `conflict` when the revision is no longer the version in `if-updated-at`.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description Required: the revision's `updated_at` the approver reviewed. Without it the decision is refused with a 428. */
                    "if-updated-at"?: string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Why, for the editor. */
                        comment: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            page_id: string;
                            /** @enum {string} */
                            status: "draft" | "submitted" | "rejected" | "published";
                            /** @description The page as the change would make it. */
                            fields: {
                                /** @description The site's routing key. */
                                url: string;
                                /** Format: uuid */
                                category_id: string | null;
                                /**
                                 * Format: uuid
                                 * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                                 */
                                parent_id: string | null;
                                title: string;
                                description: string | null;
                                /** @enum {string} */
                                visibility: "public" | "preview" | "draft";
                                form_id: string | null;
                                body_markdown: string;
                                frontmatter: {
                                    lede?: string;
                                    stage?: string;
                                    featured?: boolean;
                                    section?: string;
                                    service_type?: string;
                                    keywords?: string[];
                                    source_url?: string;
                                };
                            };
                            /**
                             * Format: date-time
                             * @description The live page's `updated_at` this revision was last saved over.
                             */
                            live_updated_at: string;
                            /** @description The user id of whoever started it. */
                            created_by: string;
                            /** @description The user id of everyone who saved to it, and of whoever submitted an earlier, rejected round of it; none of them may approve it. */
                            contributors: string[];
                            /** @description The user id of whoever submitted it for review. */
                            submitted_by: string | null;
                            /** Format: date-time */
                            submitted_at: string | null;
                            /** @description The user id of the approver who rejected or published it. */
                            decided_by: string | null;
                            /** Format: date-time */
                            decided_at: string | null;
                            /** @description Why the approver rejected it. */
                            comment: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Moves when its content is saved, not when it is submitted or rejected. Send it in `if-updated-at` to act on this version.
                             */
                            updated_at: string;
                            /** @description The fields whose proposed value differs from the live page's, in field order. Empty when the revision matches the live page. */
                            changes: {
                                /** @enum {string} */
                                field: "url" | "category_id" | "parent_id" | "title" | "description" | "visibility" | "form_id" | "body_markdown" | "frontmatter";
                                live: unknown;
                                proposed: unknown;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                            /** Format: uuid */
                            documentId: string;
                        } & {
                            [key: string]: unknown;
                        }) | {
                            /** @enum {string} */
                            error: "under_review" | "not_submitted";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                428: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}/revision/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve a submitted revision and publish it
         * @description Needs the approver role, and the approver must not have changed or submitted the revision (403 otherwise). Writes the revision to the live page as a save would, re-indexes it and records the approver in `change_events`, all in one transaction. A revision that has gone stale while it waited (its parent or category gone, or its url taken) is refused with a 422 naming the field, and nothing changes. `if-updated-at` is required (428 without it). 404 when nothing is waiting for review; 409 `not_submitted` for a draft, or `conflict` when the revision is no longer the version in `if-updated-at`. Returns the page as it now stands.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description Required: the revision's `updated_at` the approver reviewed. Without it the decision is refused with a 428. */
                    "if-updated-at"?: string;
                };
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The site's routing key. */
                            url: string;
                            /** Format: uuid */
                            category_id: string | null;
                            /**
                             * Format: uuid
                             * @description The page this one sits beneath, in the same category; null for a page at the root of its category, which is what the category lists.
                             */
                            parent_id: string | null;
                            title: string;
                            description: string | null;
                            /** @enum {string} */
                            visibility: "public" | "preview" | "draft";
                            form_id: string | null;
                            body_markdown: string;
                            frontmatter: {
                                lede?: string;
                                stage?: string;
                                featured?: boolean;
                                section?: string;
                                service_type?: string;
                                keywords?: string[];
                                source_url?: string;
                            };
                            /** Format: uuid */
                            id: string;
                            /** @description The url's last segment. */
                            slug: string;
                            /**
                             * Format: date-time
                             * @description When the page first went public; null until it has.
                             */
                            published_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /**
                             * Format: date-time
                             * @description Millisecond precision, and exactly the value to send back in `if-updated-at` on the next save.
                             */
                            updated_at: string;
                            /** @description Set when the page is public and has a change waiting for an approver, or a rejected one that has not been replaced. The fields and `updated_at` are then the revision's, and citizens still see the live page. */
                            pending_revision: {
                                /** @enum {string} */
                                status: "draft" | "submitted" | "rejected";
                                /** @description Why an approver rejected it; null unless rejected. */
                                comment: string | null;
                            } | null;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": ({
                            /** @enum {string} */
                            error: "conflict";
                            message: string;
                            /** Format: uuid */
                            documentId: string;
                        } & {
                            [key: string]: unknown;
                        }) | {
                            /** @enum {string} */
                            error: "under_review" | "not_submitted";
                            message: string;
                        };
                    };
                };
                /** @description Default Response */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "validation_failed";
                            message?: string;
                            errors: {
                                field: string;
                                message: string;
                            }[];
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                428: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                            message?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/{*}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * GitHub sign-in and session protocol
         * @description Better Auth owns the endpoints under this prefix. Responses are never cached.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    "*": string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /**
         * GitHub sign-in and session protocol
         * @description Better Auth owns the endpoints under this prefix. Responses are never cached.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    "*": string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
