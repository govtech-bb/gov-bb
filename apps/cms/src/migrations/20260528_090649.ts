// Genesis migration: this branch (feat/cms-content-collections) is the FIRST
// to introduce migrations for the CMS, so every statement is CREATE-only
// (`CREATE TABLE IF NOT EXISTS`, `CREATE TYPE`). It assumes a fresh Postgres
// database with no Payload-managed tables.
//
// Against a pre-existing CMS database — one that was provisioned without
// migrations, in dev mode or against an earlier branch — the IF NOT EXISTS
// guards will silently skip table creation, leaving stale columns and types
// behind (e.g. dropped `featured`/`section`/`publish_date` on services, the
// removed `leader_photo`, the no-longer-modeled editorial fields, and the
// short-lived `directory` table that was added and removed mid-branch).
//
// Recovery for an existing DB: drop the Payload schema (or the offending
// tables) and re-run, or generate a fresh delta migration with
// `pnpm payload migrate:create` against that database.
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_services_service_type" AS ENUM('digital', 'information');
  CREATE TYPE "public"."enum_services_stage" AS ENUM('alpha', 'beta', 'migrated');
  CREATE TYPE "public"."enum_services_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__services_v_version_service_type" AS ENUM('digital', 'information');
  CREATE TYPE "public"."enum__services_v_version_stage" AS ENUM('alpha', 'beta', 'migrated');
  CREATE TYPE "public"."enum__services_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_organisations_kind" AS ENUM('ministry', 'department', 'state-body');
  CREATE TYPE "public"."enum_organisations_stage" AS ENUM('alpha', 'beta', 'migrated');
  CREATE TYPE "public"."enum_organisations_category" AS ENUM('ministerial', 'non-ministerial', 'agency');
  CREATE TYPE "public"."enum_organisations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__organisations_v_version_kind" AS ENUM('ministry', 'department', 'state-body');
  CREATE TYPE "public"."enum__organisations_v_version_stage" AS ENUM('alpha', 'beta', 'migrated');
  CREATE TYPE "public"."enum__organisations_v_version_category" AS ENUM('ministerial', 'non-ministerial', 'agency');
  CREATE TYPE "public"."enum__organisations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TABLE IF NOT EXISTS "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"title" varchar,
  	"description" varchar,
  	"body" jsonb,
  	"subcategory_id" integer,
  	"service_type" "enum_services_service_type",
  	"stage" "enum_services_stage" DEFAULT 'alpha',
  	"source_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_services_status" DEFAULT 'draft'
  );
  
  CREATE TABLE IF NOT EXISTS "services_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "_services_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_body" jsonb,
  	"version_subcategory_id" integer,
  	"version_service_type" "enum__services_v_version_service_type",
  	"version_stage" "enum__services_v_version_stage" DEFAULT 'alpha',
  	"version_source_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__services_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE IF NOT EXISTS "_services_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_phone" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_email" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_website" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"display" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_address" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"lines" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" varchar,
  	"url" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_link_service" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"href" varchar,
  	"description" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_blocks_form_service" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"form_id" varchar,
  	"label" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_featured" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"href" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"image_alt" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_associated_departments_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_associated_departments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "organisations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"kind" "enum_organisations_kind",
  	"stage" "enum_organisations_stage" DEFAULT 'alpha',
  	"name" varchar,
  	"category" "enum_organisations_category",
  	"short_description" varchar,
  	"intro" varchar,
  	"leader_name" varchar,
  	"leader_role" varchar,
  	"hero_image_id" integer,
  	"original_source" varchar,
  	"body" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_organisations_status" DEFAULT 'draft'
  );
  
  CREATE TABLE IF NOT EXISTS "organisations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_version_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_phone" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_email" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_website" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"display" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_address" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"lines" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_version_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"platform" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_link_service" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"href" varchar,
  	"description" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_blocks_form_service" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"form_id" varchar,
  	"label" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_version_featured" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"href" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"image_alt" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_version_associated_departments_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_version_associated_departments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"category" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_kind" "enum__organisations_v_version_kind",
  	"version_stage" "enum__organisations_v_version_stage" DEFAULT 'alpha',
  	"version_name" varchar,
  	"version_category" "enum__organisations_v_version_category",
  	"version_short_description" varchar,
  	"version_intro" varchar,
  	"version_leader_name" varchar,
  	"version_leader_role" varchar,
  	"version_hero_image_id" integer,
  	"version_original_source" varchar,
  	"version_body" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__organisations_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE IF NOT EXISTS "_organisations_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "subcategories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" integer NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"credit" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE IF NOT EXISTS "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE IF NOT EXISTS "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer,
  	"organisations_id" integer,
  	"categories_id" integer,
  	"subcategories_id" integer,
  	"media_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  DO $$ BEGIN
   ALTER TABLE "services" ADD CONSTRAINT "services_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_parent_id_services_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_version_subcategory_id_subcategories_id_fk" FOREIGN KEY ("version_subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_services_v_rels" ADD CONSTRAINT "_services_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_services_v_rels" ADD CONSTRAINT "_services_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_keywords" ADD CONSTRAINT "organisations_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_phone" ADD CONSTRAINT "organisations_blocks_phone_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_email" ADD CONSTRAINT "organisations_blocks_email_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_website" ADD CONSTRAINT "organisations_blocks_website_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_address" ADD CONSTRAINT "organisations_blocks_address_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_social" ADD CONSTRAINT "organisations_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_link_service" ADD CONSTRAINT "organisations_blocks_link_service_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_blocks_form_service" ADD CONSTRAINT "organisations_blocks_form_service_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_featured" ADD CONSTRAINT "organisations_featured_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_featured" ADD CONSTRAINT "organisations_featured_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_associated_departments_items" ADD CONSTRAINT "organisations_associated_departments_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations_associated_departments"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_associated_departments" ADD CONSTRAINT "organisations_associated_departments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations" ADD CONSTRAINT "organisations_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_rels" ADD CONSTRAINT "organisations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "organisations_rels" ADD CONSTRAINT "organisations_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_keywords" ADD CONSTRAINT "_organisations_v_version_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_phone" ADD CONSTRAINT "_organisations_v_blocks_phone_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_email" ADD CONSTRAINT "_organisations_v_blocks_email_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_website" ADD CONSTRAINT "_organisations_v_blocks_website_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_address" ADD CONSTRAINT "_organisations_v_blocks_address_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_social" ADD CONSTRAINT "_organisations_v_version_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_link_service" ADD CONSTRAINT "_organisations_v_blocks_link_service_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_blocks_form_service" ADD CONSTRAINT "_organisations_v_blocks_form_service_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_featured" ADD CONSTRAINT "_organisations_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_featured" ADD CONSTRAINT "_organisations_v_version_featured_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_associated_departments_items" ADD CONSTRAINT "_organisations_v_version_associated_departments_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v_version_associated_departments"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_version_associated_departments" ADD CONSTRAINT "_organisations_v_version_associated_departments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v" ADD CONSTRAINT "_organisations_v_parent_id_organisations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v" ADD CONSTRAINT "_organisations_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_rels" ADD CONSTRAINT "_organisations_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_organisations_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "_organisations_v_rels" ADD CONSTRAINT "_organisations_v_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisations_fk" FOREIGN KEY ("organisations_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subcategories_fk" FOREIGN KEY ("subcategories_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE UNIQUE INDEX IF NOT EXISTS "services_slug_idx" ON "services" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "services_subcategory_idx" ON "services" USING btree ("subcategory_id");
  CREATE INDEX IF NOT EXISTS "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "services__status_idx" ON "services" USING btree ("_status");
  CREATE INDEX IF NOT EXISTS "services_rels_order_idx" ON "services_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "services_rels_parent_idx" ON "services_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "services_rels_path_idx" ON "services_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "services_rels_categories_id_idx" ON "services_rels" USING btree ("categories_id");
  CREATE INDEX IF NOT EXISTS "_services_v_parent_idx" ON "_services_v" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "_services_v_version_version_slug_idx" ON "_services_v" USING btree ("version_slug");
  CREATE INDEX IF NOT EXISTS "_services_v_version_version_subcategory_idx" ON "_services_v" USING btree ("version_subcategory_id");
  CREATE INDEX IF NOT EXISTS "_services_v_version_version_updated_at_idx" ON "_services_v" USING btree ("version_updated_at");
  CREATE INDEX IF NOT EXISTS "_services_v_version_version_created_at_idx" ON "_services_v" USING btree ("version_created_at");
  CREATE INDEX IF NOT EXISTS "_services_v_version_version__status_idx" ON "_services_v" USING btree ("version__status");
  CREATE INDEX IF NOT EXISTS "_services_v_created_at_idx" ON "_services_v" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "_services_v_updated_at_idx" ON "_services_v" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "_services_v_latest_idx" ON "_services_v" USING btree ("latest");
  CREATE INDEX IF NOT EXISTS "_services_v_autosave_idx" ON "_services_v" USING btree ("autosave");
  CREATE INDEX IF NOT EXISTS "_services_v_rels_order_idx" ON "_services_v_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "_services_v_rels_parent_idx" ON "_services_v_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "_services_v_rels_path_idx" ON "_services_v_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "_services_v_rels_categories_id_idx" ON "_services_v_rels" USING btree ("categories_id");
  CREATE INDEX IF NOT EXISTS "organisations_keywords_order_idx" ON "organisations_keywords" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_keywords_parent_id_idx" ON "organisations_keywords" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_phone_order_idx" ON "organisations_blocks_phone" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_phone_parent_id_idx" ON "organisations_blocks_phone" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_phone_path_idx" ON "organisations_blocks_phone" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_email_order_idx" ON "organisations_blocks_email" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_email_parent_id_idx" ON "organisations_blocks_email" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_email_path_idx" ON "organisations_blocks_email" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_website_order_idx" ON "organisations_blocks_website" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_website_parent_id_idx" ON "organisations_blocks_website" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_website_path_idx" ON "organisations_blocks_website" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_address_order_idx" ON "organisations_blocks_address" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_address_parent_id_idx" ON "organisations_blocks_address" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_address_path_idx" ON "organisations_blocks_address" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_social_order_idx" ON "organisations_social" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_social_parent_id_idx" ON "organisations_social" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_link_service_order_idx" ON "organisations_blocks_link_service" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_link_service_parent_id_idx" ON "organisations_blocks_link_service" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_link_service_path_idx" ON "organisations_blocks_link_service" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_form_service_order_idx" ON "organisations_blocks_form_service" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_form_service_parent_id_idx" ON "organisations_blocks_form_service" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_blocks_form_service_path_idx" ON "organisations_blocks_form_service" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "organisations_featured_order_idx" ON "organisations_featured" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_featured_parent_id_idx" ON "organisations_featured" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_featured_image_idx" ON "organisations_featured" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "organisations_associated_departments_items_order_idx" ON "organisations_associated_departments_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_associated_departments_items_parent_id_idx" ON "organisations_associated_departments_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_associated_departments_order_idx" ON "organisations_associated_departments" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "organisations_associated_departments_parent_id_idx" ON "organisations_associated_departments" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "organisations_slug_idx" ON "organisations" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "organisations_hero_image_idx" ON "organisations" USING btree ("hero_image_id");
  CREATE INDEX IF NOT EXISTS "organisations_updated_at_idx" ON "organisations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "organisations_created_at_idx" ON "organisations" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "organisations__status_idx" ON "organisations" USING btree ("_status");
  CREATE INDEX IF NOT EXISTS "organisations_rels_order_idx" ON "organisations_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "organisations_rels_parent_idx" ON "organisations_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "organisations_rels_path_idx" ON "organisations_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "organisations_rels_services_id_idx" ON "organisations_rels" USING btree ("services_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_keywords_order_idx" ON "_organisations_v_version_keywords" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_keywords_parent_id_idx" ON "_organisations_v_version_keywords" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_phone_order_idx" ON "_organisations_v_blocks_phone" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_phone_parent_id_idx" ON "_organisations_v_blocks_phone" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_phone_path_idx" ON "_organisations_v_blocks_phone" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_email_order_idx" ON "_organisations_v_blocks_email" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_email_parent_id_idx" ON "_organisations_v_blocks_email" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_email_path_idx" ON "_organisations_v_blocks_email" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_website_order_idx" ON "_organisations_v_blocks_website" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_website_parent_id_idx" ON "_organisations_v_blocks_website" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_website_path_idx" ON "_organisations_v_blocks_website" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_address_order_idx" ON "_organisations_v_blocks_address" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_address_parent_id_idx" ON "_organisations_v_blocks_address" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_address_path_idx" ON "_organisations_v_blocks_address" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_social_order_idx" ON "_organisations_v_version_social" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_social_parent_id_idx" ON "_organisations_v_version_social" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_link_service_order_idx" ON "_organisations_v_blocks_link_service" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_link_service_parent_id_idx" ON "_organisations_v_blocks_link_service" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_link_service_path_idx" ON "_organisations_v_blocks_link_service" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_form_service_order_idx" ON "_organisations_v_blocks_form_service" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_form_service_parent_id_idx" ON "_organisations_v_blocks_form_service" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_blocks_form_service_path_idx" ON "_organisations_v_blocks_form_service" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_featured_order_idx" ON "_organisations_v_version_featured" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_featured_parent_id_idx" ON "_organisations_v_version_featured" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_featured_image_idx" ON "_organisations_v_version_featured" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_associated_departments_items_order_idx" ON "_organisations_v_version_associated_departments_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_associated_departments_items_parent_id_idx" ON "_organisations_v_version_associated_departments_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_associated_departments_order_idx" ON "_organisations_v_version_associated_departments" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_associated_departments_parent_id_idx" ON "_organisations_v_version_associated_departments" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_parent_idx" ON "_organisations_v" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_version_slug_idx" ON "_organisations_v" USING btree ("version_slug");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_version_hero_image_idx" ON "_organisations_v" USING btree ("version_hero_image_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_version_updated_at_idx" ON "_organisations_v" USING btree ("version_updated_at");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_version_created_at_idx" ON "_organisations_v" USING btree ("version_created_at");
  CREATE INDEX IF NOT EXISTS "_organisations_v_version_version__status_idx" ON "_organisations_v" USING btree ("version__status");
  CREATE INDEX IF NOT EXISTS "_organisations_v_created_at_idx" ON "_organisations_v" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "_organisations_v_updated_at_idx" ON "_organisations_v" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "_organisations_v_latest_idx" ON "_organisations_v" USING btree ("latest");
  CREATE INDEX IF NOT EXISTS "_organisations_v_autosave_idx" ON "_organisations_v" USING btree ("autosave");
  CREATE INDEX IF NOT EXISTS "_organisations_v_rels_order_idx" ON "_organisations_v_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "_organisations_v_rels_parent_idx" ON "_organisations_v_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "_organisations_v_rels_path_idx" ON "_organisations_v_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "_organisations_v_rels_services_id_idx" ON "_organisations_v_rels" USING btree ("services_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "subcategories_slug_idx" ON "subcategories" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "subcategories_parent_idx" ON "subcategories" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "subcategories_updated_at_idx" ON "subcategories" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "subcategories_created_at_idx" ON "subcategories" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX IF NOT EXISTS "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_organisations_id_idx" ON "payload_locked_documents_rels" USING btree ("organisations_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_subcategories_id_idx" ON "payload_locked_documents_rels" USING btree ("subcategories_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX IF NOT EXISTS "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "services" CASCADE;
  DROP TABLE "services_rels" CASCADE;
  DROP TABLE "_services_v" CASCADE;
  DROP TABLE "_services_v_rels" CASCADE;
  DROP TABLE "organisations_keywords" CASCADE;
  DROP TABLE "organisations_blocks_phone" CASCADE;
  DROP TABLE "organisations_blocks_email" CASCADE;
  DROP TABLE "organisations_blocks_website" CASCADE;
  DROP TABLE "organisations_blocks_address" CASCADE;
  DROP TABLE "organisations_social" CASCADE;
  DROP TABLE "organisations_blocks_link_service" CASCADE;
  DROP TABLE "organisations_blocks_form_service" CASCADE;
  DROP TABLE "organisations_featured" CASCADE;
  DROP TABLE "organisations_associated_departments_items" CASCADE;
  DROP TABLE "organisations_associated_departments" CASCADE;
  DROP TABLE "organisations" CASCADE;
  DROP TABLE "organisations_rels" CASCADE;
  DROP TABLE "_organisations_v_version_keywords" CASCADE;
  DROP TABLE "_organisations_v_blocks_phone" CASCADE;
  DROP TABLE "_organisations_v_blocks_email" CASCADE;
  DROP TABLE "_organisations_v_blocks_website" CASCADE;
  DROP TABLE "_organisations_v_blocks_address" CASCADE;
  DROP TABLE "_organisations_v_version_social" CASCADE;
  DROP TABLE "_organisations_v_blocks_link_service" CASCADE;
  DROP TABLE "_organisations_v_blocks_form_service" CASCADE;
  DROP TABLE "_organisations_v_version_featured" CASCADE;
  DROP TABLE "_organisations_v_version_associated_departments_items" CASCADE;
  DROP TABLE "_organisations_v_version_associated_departments" CASCADE;
  DROP TABLE "_organisations_v" CASCADE;
  DROP TABLE "_organisations_v_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "subcategories" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_services_service_type";
  DROP TYPE "public"."enum_services_stage";
  DROP TYPE "public"."enum_services_status";
  DROP TYPE "public"."enum__services_v_version_service_type";
  DROP TYPE "public"."enum__services_v_version_stage";
  DROP TYPE "public"."enum__services_v_version_status";
  DROP TYPE "public"."enum_organisations_kind";
  DROP TYPE "public"."enum_organisations_stage";
  DROP TYPE "public"."enum_organisations_category";
  DROP TYPE "public"."enum_organisations_status";
  DROP TYPE "public"."enum__organisations_v_version_kind";
  DROP TYPE "public"."enum__organisations_v_version_stage";
  DROP TYPE "public"."enum__organisations_v_version_category";
  DROP TYPE "public"."enum__organisations_v_version_status";
  DROP TYPE "public"."enum_users_role";`)
}
