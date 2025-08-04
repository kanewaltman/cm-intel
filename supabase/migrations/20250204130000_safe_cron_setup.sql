/*
  # Safe setup for automated daily summary generation with pg_cron
  
  This migration safely sets up the cron job, handling existing objects gracefully.
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension if not already enabled (needed for HTTP requests)
CREATE EXTENSION IF NOT EXISTS http;

-- Remove any existing cron job with the same name (safe to run multiple times)
SELECT cron.unschedule('generate_daily_summary');

-- Schedule the daily summary generation job
-- This will run at 6:00 AM UTC every day
SELECT cron.schedule(
  'generate_daily_summary',
  '0 6 * * *',
  $$
  SELECT 
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/generate-daily-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as response;
  $$
);

-- Create or replace the manual trigger function
CREATE OR REPLACE FUNCTION trigger_daily_summary_generation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response jsonb;
BEGIN
  SELECT 
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/generate-daily-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) INTO response;
  
  RETURN response;
END;
$$;

-- Grant execute permission on the trigger function (safe to run multiple times)
GRANT EXECUTE ON FUNCTION trigger_daily_summary_generation() TO anon;
GRANT EXECUTE ON FUNCTION trigger_daily_summary_generation() TO authenticated;

-- Create or replace the configuration check function
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

-- Create or replace the view to see active cron jobs
DROP VIEW IF EXISTS active_cron_jobs;
CREATE VIEW active_cron_jobs AS
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