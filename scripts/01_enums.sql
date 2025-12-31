-- ============================================
-- 01_enums.sql
-- SecuredLead CRM - Enum Types
-- Run this FIRST before any other scripts
-- ============================================

-- Clean up if re-running (be careful in production!)
-- DROP TYPE IF EXISTS public.app_role CASCADE;
-- DROP TYPE IF EXISTS public.lead_status CASCADE;
-- DROP TYPE IF EXISTS public.task_priority CASCADE;
-- DROP TYPE IF EXISTS public.task_status CASCADE;

-- Application roles for access control
-- 'admin' = full access to all data and user management
-- 'agent' = limited access to assigned leads/tasks only
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');

-- Lead pipeline statuses
CREATE TYPE public.lead_status AS ENUM (
  'new',        -- Just created, not contacted
  'contacted',  -- Initial contact made
  'qualified',  -- Confirmed as valid opportunity
  'converted',  -- Successfully closed
  'lost'        -- Did not convert
);

-- Task priority levels
CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

-- Task status values
CREATE TYPE public.task_status AS ENUM (
  'pending',     -- Not started
  'in_progress', -- Being worked on
  'completed',   -- Done
  'cancelled'    -- Abandoned
);

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Enums created successfully:';
  RAISE NOTICE '  - app_role: admin, agent';
  RAISE NOTICE '  - lead_status: new, contacted, qualified, converted, lost';
  RAISE NOTICE '  - task_priority: low, medium, high, urgent';
  RAISE NOTICE '  - task_status: pending, in_progress, completed, cancelled';
END $$;
