-- ============================================
-- 10_realtime.sql
-- SecuredLead CRM - Realtime Configuration
-- Run AFTER 09_audit_triggers.sql
-- ============================================
-- Enable Supabase Realtime for tables that need live updates.
-- RLS policies are still enforced on realtime subscriptions.

-- ==================
-- Enable realtime publication
-- ==================

-- Add tables to the supabase_realtime publication
-- This allows clients to subscribe to changes via websocket.

-- Leads: Agents need to see when their leads are updated
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Tasks: Agents need to see when they get new tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Activity logs: Admins monitor activity in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- Profiles: Used for instant kill switch propagation
-- When admin sets is_active=false, agent should be logged out immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ==================
-- Note on security
-- ==================
-- Realtime subscriptions respect RLS policies.
-- Agents will only receive events for rows they can SELECT.
-- This means:
--   - Agents only see their own assigned leads/tasks
--   - Agents only see their own activity logs
--   - Agents only see their own profile changes

-- Verify setup
DO $$
BEGIN
  RAISE NOTICE 'Realtime enabled for:';
  RAISE NOTICE '  - leads (agent dashboard updates)';
  RAISE NOTICE '  - tasks (new task notifications)';
  RAISE NOTICE '  - activity_logs (admin monitoring)';
  RAISE NOTICE '  - profiles (kill switch propagation)';
  RAISE NOTICE '';
  RAISE NOTICE 'Security: RLS policies apply to realtime subscriptions.';
END $$;
