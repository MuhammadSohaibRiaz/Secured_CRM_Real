-- ============================================
-- 02_tables.sql
-- SecuredLead CRM - Core Tables
-- Run AFTER 01_enums.sql
-- ============================================

-- ==================
-- 1. profiles
-- ==================
-- Stores user profile information. Links to auth.users via user_id.
-- Separate from auth.users to allow custom fields and RLS control.

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,  -- Links to auth.users(id)
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,  -- Kill switch: set to false to disable user
  created_by uuid,  -- Which admin created this user
  last_login_at timestamp with time zone,  -- Updated via trigger on auth.users
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase Auth users';
COMMENT ON COLUMN public.profiles.is_active IS 'Kill switch - set to false to immediately disable user access';
COMMENT ON COLUMN public.profiles.created_by IS 'UUID of admin who created this user';

-- ==================
-- 2. user_roles
-- ==================
-- Stores user roles SEPARATELY from profiles.
-- This is a security best practice to prevent privilege escalation.
-- Users cannot modify their own role because RLS only allows admin INSERT/UPDATE.

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,  -- Links to auth.users(id)
  role public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)  -- One role per user (can expand to multiple if needed)
);

COMMENT ON TABLE public.user_roles IS 'User roles stored separately from profiles for security';
COMMENT ON COLUMN public.user_roles.role IS 'Either admin or agent';

-- ==================
-- 3. leads
-- ==================
-- Stores lead/prospect information with PII fields (email, phone).
-- PII is accessed through leads_masked view or reveal_lead_pii() function.

CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,  -- PII: masked in leads_masked view
  phone text,  -- PII: masked in leads_masked view
  company text,
  source text,  -- Where lead came from (web, referral, etc.)
  notes text,   -- Agent notes about the lead
  status public.lead_status NOT NULL DEFAULT 'new'::lead_status,
  assigned_to uuid,  -- Agent assigned to this lead
  created_by uuid NOT NULL,  -- Admin who created the lead
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Lead/prospect information with PII fields';
COMMENT ON COLUMN public.leads.email IS 'PII: Access via leads_masked view or reveal_lead_pii()';
COMMENT ON COLUMN public.leads.phone IS 'PII: Access via leads_masked view or reveal_lead_pii()';
COMMENT ON COLUMN public.leads.assigned_to IS 'Agent user_id who is responsible for this lead';

-- ==================
-- 4. tasks
-- ==================
-- Stores tasks assigned to agents.

CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'pending'::task_status,
  priority public.task_priority NOT NULL DEFAULT 'medium'::task_priority,
  assigned_to uuid NOT NULL,  -- Agent assigned to this task
  created_by uuid NOT NULL,   -- Admin who created the task
  due_date timestamp with time zone,
  completed_at timestamp with time zone,  -- Set when status changes to 'completed'
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS 'Tasks assigned to agents by admins';
COMMENT ON COLUMN public.tasks.completed_at IS 'Automatically set when status changes to completed';

-- ==================
-- 5. activity_logs
-- ==================
-- Audit trail for all user actions.
-- APPEND-ONLY: No UPDATE or DELETE policies exist.

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,  -- Who performed the action
  entity_type text NOT NULL,  -- 'lead', 'task', 'agent', 'profile', etc.
  entity_id uuid,  -- ID of the affected entity (nullable for system events)
  action text NOT NULL,  -- What was done: 'created', 'updated', 'revealed_email', etc.
  details jsonb,  -- Additional context (old/new values, IP, etc.)
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_logs IS 'Immutable audit log for all user actions';
COMMENT ON COLUMN public.activity_logs.details IS 'JSON with additional context like changes, IP address, etc.';

-- ==================
-- Enable RLS on all tables
-- ==================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Tables created successfully with RLS enabled:';
  RAISE NOTICE '  - profiles (user info, is_active kill switch)';
  RAISE NOTICE '  - user_roles (separated for security)';
  RAISE NOTICE '  - leads (with PII fields)';
  RAISE NOTICE '  - tasks (agent tasks)';
  RAISE NOTICE '  - activity_logs (immutable audit trail)';
END $$;
