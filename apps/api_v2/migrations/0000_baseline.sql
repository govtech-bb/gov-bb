CREATE TYPE "public"."change_action" AS ENUM('created', 'updated', 'published', 'reverted', 'deleted', 'unpublished', 'submitted', 'rejected', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."page_visibility" AS ENUM('public', 'preview', 'draft');--> statement-breakpoint
CREATE SEQUENCE "public"."change_event_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9007199254740991 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."content_edit_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9007199254740991 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "auth_session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "auth_user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT nextval('content_edit_version_seq') NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "change_event_counters" (
	"entity_kind" varchar(40) NOT NULL,
	"entity_id" text NOT NULL,
	"last_version" integer NOT NULL,
	CONSTRAINT "change_event_counters_pkey" PRIMARY KEY("entity_kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" varchar(40) NOT NULL,
	"entity_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"event_order" bigint DEFAULT nextval('change_event_order_seq'),
	"action" "change_action" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_version" integer DEFAULT 1,
	"actor" text DEFAULT 'system' NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"restored_from" integer,
	CONSTRAINT "change_events_entity_kind_entity_id_version_no_key" UNIQUE("entity_kind","entity_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "collection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_key" varchar(100) NOT NULL,
	"record_key" varchar(200) NOT NULL,
	"data" jsonb NOT NULL,
	"version" bigint DEFAULT nextval('content_edit_version_seq') NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_records_collection_key_record_key_key" UNIQUE("collection_key","record_key")
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" varchar(512) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"category_id" uuid,
	"parent_id" uuid,
	"title" varchar(300) NOT NULL,
	"description" text,
	"visibility" "page_visibility" DEFAULT 'draft' NOT NULL,
	"form_id" varchar(100),
	"body_markdown" text NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp (3) with time zone,
	"content_updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT nextval('content_edit_version_seq') NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_pages_url_key" UNIQUE("url"),
	CONSTRAINT "content_pages_id_category_id_key" UNIQUE("id","category_id")
);
--> statement-breakpoint
CREATE TABLE "data_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"record_key" varchar(100) NOT NULL,
	"schema" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_collections_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "page_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" varchar(512) NOT NULL,
	"destination_url" varchar(512) NOT NULL,
	CONSTRAINT "page_redirects_source_url_unique" UNIQUE("source_url"),
	CONSTRAINT "page_redirects_not_self" CHECK ("page_redirects"."source_url" <> "page_redirects"."destination_url")
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fields" jsonb NOT NULL,
	"live_updated_at" timestamp (3) with time zone NOT NULL,
	"created_by" text NOT NULL,
	"contributors" text[] NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp (3) with time zone,
	"decided_by" text,
	"decided_at" timestamp (3) with time zone,
	"comment" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_revisions_status_check" CHECK ("page_revisions"."status" in ('draft', 'submitted', 'rejected', 'published', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "search_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text,
	"body" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || body)) STORED,
	CONSTRAINT "search_chunks_page_id_ordinal_key" UNIQUE("page_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_check" CHECK ("user_roles"."role" in ('editor', 'approver', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_actor_fkey" FOREIGN KEY ("actor") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_records" ADD CONSTRAINT "collection_records_collection_key_fkey" FOREIGN KEY ("collection_key") REFERENCES "public"."data_collections"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."content_pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_parent_category_fkey" FOREIGN KEY ("parent_id","category_id") REFERENCES "public"."content_pages"("id","category_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_userId_idx" ON "auth_account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "auth_session_userId_idx" ON "auth_session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "change_events_event_order_unique" ON "change_events" USING btree ("event_order");--> statement-breakpoint
CREATE INDEX "content_pages_parent_id_idx" ON "content_pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "content_pages_category_id_idx" ON "content_pages" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "page_redirects_destination_url_idx" ON "page_redirects" USING btree ("destination_url");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_open_page_id_key" ON "page_revisions" USING btree ("page_id") WHERE status in ('draft', 'submitted');--> statement-breakpoint
CREATE INDEX "search_chunks_tsv_idx" ON "search_chunks" USING gin ("tsv");