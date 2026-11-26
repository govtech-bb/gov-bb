CREATE TABLE "waiting_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiting_roles_email_role_key" UNIQUE("email","role"),
	CONSTRAINT "waiting_roles_role_check" CHECK ("waiting_roles"."role" in ('editor', 'approver', 'admin'))
);
