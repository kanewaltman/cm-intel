# Daily Summary Cron Job Setup

This guide explains how to set up automated daily summary generation using Supabase's pg_cron extension.

## Overview

The system consists of:
1. **Edge Function** (`generate-daily-summary`): Handles the summary generation logic
2. **pg_cron Job**: Automatically triggers the Edge Function daily at 6:00 AM UTC
3. **Database Migrations**: Set up the cron job and configuration

## Setup Steps

### 1. Deploy the Edge Function

First, deploy the Edge Function to your Supabase project:

```bash
# Navigate to your project root
cd /path/to/your/project

# Deploy the Edge Function
supabase functions deploy generate-daily-summary
```

### 2. Run Database Migrations

Apply the migrations to set up pg_cron:

```bash
# Apply all pending migrations
supabase db push

# Or apply specific migrations
supabase migration up
```

### 3. Configure Environment Settings

You need to configure the following settings in your Supabase project:

#### Option A: Via Supabase Dashboard
1. Go to your Supabase dashboard
2. Navigate to Settings > Custom Settings
3. Add the following settings:
   - `app.supabase_url`: Your Supabase project URL (e.g., `https://your-project-ref.supabase.co`)
   - `app.supabase_service_role_key`: Your service role key

#### Option B: Via SQL (if you have sufficient permissions)
```sql
-- Set your Supabase URL
ALTER SYSTEM SET app.supabase_url = 'https://your-project-ref.supabase.co';

-- Set your service role key
ALTER SYSTEM SET app.supabase_service_role_key = 'your-service-role-key-here';

-- Reload configuration
SELECT pg_reload_conf();
```

### 4. Enable Required Extensions

Ensure the following extensions are enabled in your Supabase project:

1. **pg_cron**: Usually enabled by default in Supabase
2. **http**: Required for making HTTP requests from cron jobs

You can enable these via the Supabase dashboard under Database > Extensions.

### 5. Set Environment Variables

Make sure your Supabase project has the following environment variable:
- `VITE_PERPLEXITY_API_KEY`: Your Perplexity API key

This can be set in the Supabase dashboard under Settings > Environment Variables.

## Verification

### Check Cron Configuration
```sql
-- Check if settings are properly configured
SELECT * FROM check_cron_configuration();
```

### View Active Cron Jobs
```sql
-- See all active cron jobs
SELECT * FROM active_cron_jobs;
```

### Manual Testing
```sql
-- Manually trigger summary generation for testing
SELECT trigger_daily_summary_generation();
```

### Test the Edge Function Directly
You can also test the Edge Function directly:

```bash
curl -X POST \
  https://your-project-ref.supabase.co/functions/v1/generate-daily-summary \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Cron Schedule

The cron job is configured to run at **6:00 AM UTC** every day using the schedule `0 6 * * *`.

You can modify this schedule by updating the migration file or running:

```sql
-- Update the cron schedule (example: run at 8:00 AM UTC)
SELECT cron.alter_job('generate_daily_summary', schedule => '0 8 * * *');
```

## Troubleshooting

### Common Issues

1. **Cron job not running**: Check if pg_cron extension is enabled
2. **HTTP requests failing**: Ensure the http extension is enabled
3. **Permission errors**: Verify service role key has proper permissions
4. **API key issues**: Check that VITE_PERPLEXITY_API_KEY is set correctly

### Debugging

Check cron job logs:
```sql
-- View cron job execution history
SELECT * FROM cron.job_run_details 
WHERE jobname = 'generate_daily_summary' 
ORDER BY start_time DESC 
LIMIT 10;
```

### Manual Cleanup

If you need to remove the cron job:
```sql
-- Remove the cron job
SELECT cron.unschedule('generate_daily_summary');
```

## How It Works

1. **Daily Check**: The cron job runs every day at 6:00 AM UTC
2. **Existing Summary Check**: The Edge Function first checks if a summary already exists for today
3. **Generation**: If no summary exists, it calls the Perplexity API to generate a new one
4. **Storage**: The generated summary is stored in the `daily_summaries` table
5. **Idempotency**: If a summary already exists, the function returns early without generating a duplicate

This ensures that:
- Summaries are generated automatically without manual intervention
- No duplicate summaries are created
- The system is resilient to multiple triggers
- Your existing frontend logic continues to work unchanged