-- Delete AI-generated test forms from sandbox
-- Run via psql against modular-forms-db-sandbox

-- First, list what we're about to delete (dry run)
SELECT form_id, schema->>'title' as title, created_at
FROM form_definitions
WHERE form_id IN (
  'yar-performing-arts-registration-2025',
  'yar-performing-arts-registration-2025-2026',
  'pathways-employability-programme-application-2026',
  'pathways-employability-programme-2026',
  'project-dawn-training-programme-application',
  'project-dawn-training-programme',
  'primary-school-textbook-grant'
)
OR schema->>'title' ILIKE '%Youth Achieving Results%Performing Arts%'
OR schema->>'title' ILIKE '%Pathways Employability%'
OR schema->>'title' ILIKE '%Project Dawn%Training%'
OR schema->>'title' ILIKE '%Primary School Textbook Grant%'
ORDER BY created_at DESC;

-- Uncomment below to actually delete:
-- DELETE FROM form_definitions
-- WHERE form_id IN (
--   'yar-performing-arts-registration-2025',
--   'yar-performing-arts-registration-2025-2026',
--   'pathways-employability-programme-application-2026',
--   'pathways-employability-programme-2026',
--   'project-dawn-training-programme-application',
--   'project-dawn-training-programme',
--   'primary-school-textbook-grant'
-- )
-- OR schema->>'title' ILIKE '%Youth Achieving Results%Performing Arts%'
-- OR schema->>'title' ILIKE '%Pathways Employability%'
-- OR schema->>'title' ILIKE '%Project Dawn%Training%'
-- OR schema->>'title' ILIKE '%Primary School Textbook Grant%';
