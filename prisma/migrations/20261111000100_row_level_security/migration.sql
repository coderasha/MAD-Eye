-- Defense in depth for the non-owner role madeye_app.
-- The table owner used by Prisma migrate bypasses these policies.
-- Identity tables stay outside RLS so a user can list memberships before a tenant is chosen.
-- API keys and webhooks stay outside RLS because they are resolved before a tenant setting exists.

CREATE OR REPLACE FUNCTION madeye_current_tenant() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'documents',
    'document_pages',
    'document_assets',
    'batches',
    'processing_jobs',
    'processing_stages',
    'recognition_regions',
    'extracted_fields',
    'tables',
    'table_cells',
    'validation_results',
    'review_tasks',
    'corrections',
    'usage_records',
    'extraction_schemas',
    'model_executions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = madeye_current_tenant()) WITH CHECK (tenant_id = madeye_current_tenant())',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read ON audit_events;
DROP POLICY IF EXISTS audit_insert ON audit_events;
CREATE POLICY audit_read ON audit_events
  FOR SELECT
  USING (tenant_id = madeye_current_tenant());
CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id IS NULL OR tenant_id = madeye_current_tenant());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'madeye_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madeye_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO madeye_app;
  END IF;
END $$;
