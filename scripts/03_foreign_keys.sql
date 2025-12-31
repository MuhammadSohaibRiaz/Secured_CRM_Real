-- ============================================
-- 03_foreign_keys.sql
-- SecuredLead CRM - Foreign Key Constraints
-- Run AFTER 02_tables.sql
-- ============================================
-- NOTE: These FKs reference auth.users which is managed by Supabase.
-- They ensure referential integrity and prevent orphaned records.

-- ==================
-- profiles foreign keys
-- ==================

-- Link profiles to auth.users
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;  -- If auth user deleted, delete profile

-- Link created_by to auth.users (nullable)
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_created_by 
  FOREIGN KEY (created_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;  -- If creator deleted, keep profile but null out creator

-- ==================
-- user_roles foreign keys
-- ==================

ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;  -- If auth user deleted, delete role

-- ==================
-- leads foreign keys
-- ==================

-- Link assigned_to to auth.users (nullable - lead can be unassigned)
ALTER TABLE public.leads
  ADD CONSTRAINT fk_leads_assigned_to 
  FOREIGN KEY (assigned_to) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;  -- If agent deleted, unassign lead (don't delete lead)

-- Link created_by to auth.users (required)
ALTER TABLE public.leads
  ADD CONSTRAINT fk_leads_created_by 
  FOREIGN KEY (created_by) 
  REFERENCES auth.users(id) 
  ON DELETE RESTRICT;  -- Prevent deleting admin if they created leads

-- ==================
-- tasks foreign keys
-- ==================

-- Link assigned_to to auth.users (required - task must have assignee)
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_assigned_to 
  FOREIGN KEY (assigned_to) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;  -- If agent deleted, delete their tasks

-- Link created_by to auth.users (required)
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_created_by 
  FOREIGN KEY (created_by) 
  REFERENCES auth.users(id) 
  ON DELETE RESTRICT;  -- Prevent deleting admin if they created tasks

-- ==================
-- activity_logs foreign keys
-- ==================

-- Link user_id to auth.users
ALTER TABLE public.activity_logs
  ADD CONSTRAINT fk_activity_logs_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE RESTRICT;  -- NEVER delete user if they have activity logs (audit trail)

-- NOTE: entity_id is polymorphic (can reference leads, tasks, etc.)
-- so we cannot add a single FK for it. This is intentional.

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Foreign key constraints added:';
  RAISE NOTICE '  - profiles.user_id → auth.users (CASCADE)';
  RAISE NOTICE '  - profiles.created_by → auth.users (SET NULL)';
  RAISE NOTICE '  - user_roles.user_id → auth.users (CASCADE)';
  RAISE NOTICE '  - leads.assigned_to → auth.users (SET NULL)';
  RAISE NOTICE '  - leads.created_by → auth.users (RESTRICT)';
  RAISE NOTICE '  - tasks.assigned_to → auth.users (CASCADE)';
  RAISE NOTICE '  - tasks.created_by → auth.users (RESTRICT)';
  RAISE NOTICE '  - activity_logs.user_id → auth.users (RESTRICT)';
END $$;
