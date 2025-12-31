-- ============================================
-- 12_agent_stats_view.sql
-- SecuredLead CRM - Agent Performance Stats View
-- Run this to enable the Analytics Dashboard
-- ============================================

-- This view provides real-time aggregation of agent performance.
-- It uses 'security_invoker = true' so that:
-- 1. Admins seeing this view get stats for ALL agents (because they can see all leads).
-- 2. Agents seeing this view get stats ONLY for themselves (because they can only see their own leads).

CREATE OR REPLACE VIEW public.agent_stats WITH (security_invoker = true) AS
WITH lead_stats AS (
  SELECT
    assigned_to,
    COUNT(*) as total_leads,
    COUNT(*) FILTER (WHERE status = 'new') as new_leads,
    COUNT(*) FILTER (WHERE status = 'contacted') as contacted_leads,
    COUNT(*) FILTER (WHERE status = 'qualified') as qualified_leads,
    COUNT(*) FILTER (WHERE status = 'converted') as converted_leads,
    COUNT(*) FILTER (WHERE status = 'lost') as lost_leads
  FROM public.leads
  GROUP BY assigned_to
),
task_stats AS (
  SELECT
    assigned_to,
    COUNT(*) as total_tasks,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
    COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'completed') as overdue_tasks
  FROM public.tasks
  GROUP BY assigned_to
)
SELECT
  p.user_id,
  p.full_name,
  p.email,
  p.is_active,
  p.last_login_at,
  
  -- Lead Metrics (COALESCE to 0 in case no leads found)
  COALESCE(l.total_leads, 0) as total_leads,
  COALESCE(l.new_leads, 0) as new_leads,
  COALESCE(l.contacted_leads, 0) as contacted_leads,
  COALESCE(l.qualified_leads, 0) as qualified_leads,
  COALESCE(l.converted_leads, 0) as converted_leads,
  COALESCE(l.lost_leads, 0) as lost_leads,
  
  -- Task Metrics (COALESCE to 0 in case no tasks found)
  COALESCE(t.total_tasks, 0) as total_tasks,
  COALESCE(t.pending_tasks, 0) as pending_tasks,
  COALESCE(t.in_progress_tasks, 0) as in_progress_tasks,
  COALESCE(t.completed_tasks, 0) as completed_tasks,
  COALESCE(t.overdue_tasks, 0) as overdue_tasks,
  
  -- Calculated Metrics
  CASE 
    WHEN COALESCE(l.total_leads, 0) > 0 THEN 
      ROUND((COALESCE(l.converted_leads, 0)::numeric / l.total_leads::numeric) * 100, 1)
    ELSE 0
  END as conversion_rate

FROM public.profiles p
JOIN public.user_roles ur ON p.user_id = ur.user_id
LEFT JOIN lead_stats l ON p.user_id = l.assigned_to
LEFT JOIN task_stats t ON p.user_id = t.assigned_to
WHERE ur.role = 'agent';

COMMENT ON VIEW public.agent_stats IS 'Real-time performance statistics for agents. Fixed duplicate counting bug.';

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'View agent_stats updated successfully.';
END $$;
