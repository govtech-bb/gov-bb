CREATE TABLE IF NOT EXISTS "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"kind" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"payload" jsonb,
	"embed_hash" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"summary" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rag_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"section" text,
	"source" text DEFAULT 'alpha' NOT NULL,
	"service_slug" text,
	"form_ids" jsonb,
	"text" text NOT NULL,
	"content_hash" text,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunks_kind_idx" ON "chunks" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_kind_idx" ON "documents" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_documents_embedding_idx" ON "rag_documents" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_documents_source_idx" ON "rag_documents" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_documents_service_slug_idx" ON "rag_documents" USING btree ("service_slug");