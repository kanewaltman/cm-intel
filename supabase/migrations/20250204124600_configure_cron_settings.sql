/*
  # Configure settings for pg_cron daily summary job
  
  This migration sets up the necessary configuration settings
  that the cron job needs to call the Edge Function.
  
  Note: The actual values need to be set via Supabase dashboard
  or environment variables in your Supabase project.
*/

-- These settings need to be configured in your Supabase project
-- You can set them via the Supabase dashboard under Settings > Custom Settings
-- or via SQL if you have the necessary permissions

-- Example of how to set the settings (you'll need to replace with your actual values):
-- ALTER SYSTEM SET app.supabase_url = 'https://your-project-ref.supabase.co';
-- ALTER SYSTEM SET app.supabase_service_role_key = 'your-service-role-key';
-- SELECT pg_reload_conf();

-- For now, we'll create a function that can help verify the settings are configured
CREATE OR REPLACE FUNCTION check_cron_configuration()
RETURNS TABLE(
  setting_name text,
  setting_value text,
  is_configured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'app.supabase_url'::text as setting_name,
    COALESCE(current_setting('app.supabase_url', true), 'NOT SET')::text as setting_value,
    (current_setting('app.supabase_url', true) IS NOT NULL AND current_setting('app.supabase_url', true) != '')::boolean as is_configured
  UNION ALL
  SELECT 
    'app.supabase_service_role_key'::text as setting_name,
    CASE 
      WHEN current_setting('app.supabase_service_role_key', true) IS NOT NULL 
        AND current_setting('app.supabase_service_role_key', true) != ''
      THEN 'CONFIGURED (hidden for security)'
      ELSE 'NOT SET'
    END::text as setting_value,
    (current_setting('app.supabase_service_role_key', true) IS NOT NULL AND current_setting('app.supabase_service_role_key', true) != '')::boolean as is_configured;
END;
$$;

-- Grant execute permission on the check function
GRANT EXECUTE ON FUNCTION check_cron_configuration() TO anon;
GRANT EXECUTE ON FUNCTION check_cron_configuration() TO authenticated;

-- Create a view to see active cron jobs
CREATE OR REPLACE VIEW active_cron_jobs AS
SELECT 
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobid
FROM cron.job
WHERE active = true;

-- Grant access to the view
GRANT SELECT ON active_cron_jobs TO anon;
GRANT SELECT ON active_cron_jobs TO authenticated;