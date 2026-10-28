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
                            /** @description The slug of the category the page is filed under, or null for a page outside the taxonomy. */
                            category: string | null;
                            /** @description The slug of its subcategory, or null. */
                            subcategory: string | null;
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
         * @description Requires an employee session and the editor's Origin header.
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
         * @description The editor's read: any visibility, markdown included.
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
         * @description Requires an employee session and the editor's Origin header. Send every field: a save replaces the page and defaults none, except that leaving `parent_id` out keeps the page's parent. Send the `updated_at` you last read in the `if-updated-at` header. If the stored row has moved on since, the save is refused with a 409 rather than silently discarding whoever wrote first. Changing `url` moves this page alone: its sub-pages keep their urls and stay beneath it by `parent_id`, and nothing redirects from the old url.
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
                            /** Format: uuid */
                            documentId: string;
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
        post?: never;
        /**
         * Delete a page
         * @description Requires an employee session and the editor's Origin header. A page with sub-pages is refused (422) until they are moved or deleted.
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
        /** Append a category or subcategory */
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
        /** Edit a category using its last-read version */
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
        /** Delete an empty, unanchored category using its last-read version */
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
        /** Atomically reorder a complete, versioned sibling snapshot */
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
    "/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A version token for recorded page changes
         * @description `change_events` currently records page writes only. Its count and newest timestamp identify those changes without reading the pages. Category changes do not advance this token until trigger-based events land.
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
