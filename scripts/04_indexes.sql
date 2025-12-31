-- ============================================
-- 04_indexes.sql
-- SecuredLead CRM - Performance Indexes
-- Run AFTER 03_foreign_keys.sql
-- ============================================
-- These indexes optimize common query patterns and RLS policy checks.

-- ==================
-- profiles indexes
-- ==================

-- Fast lookup by user_id (used in RLS and joins)
CREATE INDEX idx_profiles_user_id 
  ON public.profiles(user_id);

-- Find active users quickly
CREATE INDEX idx_profiles_is_active 
  ON public.profiles(is_active) 
  WHERE is_active = true;

-- ==================
-- user_roles indexes
-- ==================

-- Fast role lookup by user_id (used heavily in has_role() function)
CREATE INDEX idx_user_roles_user_id 
  ON public.user_roles(user_id);

-- Fast lookup by role (find all admins, all agents)
CREATE INDEX idx_user_roles_role 
  ON public.user_roles(role);

-- ==================
-- leads indexes
-- ==================

-- Fast lookup by assigned agent (critical for agent RLS)
CREATE INDEX idx_leads_assigned_to 
  ON public.leads(assigned_to);

-- Filter by status (pipeline view)
CREATE INDEX idx_leads_status 
  ON public.leads(status);

-- Sort by creation date (newest first)
CREATE INDEX idx_leads_created_at 
  ON public.leads(created_at DESC);

-- Sort by update date (recently modified)
CREATE INDEX idx_leads_updated_at 
  ON public.leads(updated_at DESC);

-- Combined index for agent dashboard (their leads, sorted by update)
CREATE INDEX idx_leads_agent_recent 
  ON public.leads(assigned_to, updated_at DESC);

-- ==================
-- tasks indexes
-- ==================

-- Fast lookup by assigned agent
CREATE INDEX idx_tasks_assigned_to 
  ON public.tasks(assigned_to);

-- Filter by status
CREATE INDEX idx_tasks_status 
  ON public.tasks(status);

-- Find overdue tasks
CREATE INDEX idx_tasks_due_date 
  ON public.tasks(due_date) 
  WHERE status NOT IN ('completed', 'cancelled');

-- Combined index for agent dashboard
CREATE INDEX idx_tasks_agent_pending 
  ON public.tasks(assigned_to, status, due_date);

-- ==================
-- activity_logs indexes
-- ==================

-- CRITICAL: Used by reveal_lead_pii() for rate limiting
-- This index is essential for performance of the rate limit check
CREATE INDEX idx_activity_logs_rate_limit 
  ON public.activity_logs(user_id, action, created_at DESC);

-- Fast lookup by entity (view activity for a specific lead)
CREATE INDEX idx_activity_logs_entity 
  ON public.activity_logs(entity_type, entity_id);

-- View recent activity (activity dashboard)
CREATE INDEX idx_activity_logs_recent 
  ON public.activity_logs(created_at DESC);

-- Find specific actions (e.g., all reveals)
CREATE INDEX idx_activity_logs_action 
  ON public.activity_logs(action, created_at DESC);

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Indexes created for performance optimization:';
  RAISE NOTICE '  - profiles: user_id, is_active';
  RAISE NOTICE '  - user_roles: user_id, role';
  RAISE NOTICE '  - leads: assigned_to, status, created_at, updated_at, combined';
  RAISE NOTICE '  - tasks: assigned_to, status, due_date, combined';
  RAISE NOTICE '  - activity_logs: rate_limit (critical!), entity, recent, action';
END $$;
