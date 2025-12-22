-- No database changes needed for password protection - this is configured in Supabase Auth settings
-- Adding a comment to document that leaked password protection should be enabled in Supabase dashboard

-- However, let's ensure our activity_logs table has an index for the rate limiting query performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_rate_limit 
ON public.activity_logs (user_id, action, created_at DESC)
WHERE action IN ('revealed_email', 'revealed_phone');