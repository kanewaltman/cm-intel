/*
  # Setup automated daily summary generation with pg_cron
  
  This migration:
  1. Enables the pg_cron extension
  2. Creates a cron job to automatically generate daily summaries
  3. Schedules the job to run at 6:00 AM UTC every day
  4. Calls the Supabase Edge Function we created
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing cron job with the same name (in case we're re-running)
SELECT cron.unschedule('generate_daily_summary');

-- Schedule the daily summary generation job
-- This will run at 6:00 AM UTC every day
-- The Edge Function will check if a summary already exists and skip if it does
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

-- Grant necessary permissions for the cron job to access the http extension
-- Note: This might already be enabled in your Supabase project
-- If you get an error, the http extension might need to be enabled via Supabase dashboard

-- Optional: Add a function to manually trigger summary generation (for testing)
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

-- Grant execute permission on the trigger function
GRANT EXECUTE ON FUNCTION trigger_daily_summary_generation() TO anon;
GRANT EXECUTE ON FUNCTION trigger_daily_summary_generation() TO authenticated;