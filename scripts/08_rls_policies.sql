-- ============================================
-- 08_rls_policies.sql
-- SecuredLead CRM - Row Level Security Policies
-- Run AFTER 07_triggers.sql
-- ============================================
-- These policies control who can see and modify what data.
-- Remember: RLS is the LAST line of defense. Backend should also validate.

-- ==================
-- profiles policies
-- ==================

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

-- Admins can insert profiles (create new users)
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update any profile (including is_active for kill switch)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can update their own profile (but not is_active - enforced by trigger)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ==================
-- user_roles policies
-- ==================
-- CRITICAL: Users should NEVER be able to modify their own role.

-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own role (for frontend role checks)
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Admins can insert roles (assign roles to users)
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update roles (change user roles)
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete roles
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ==================
-- leads policies
-- ==================

-- Admins can view all leads
CREATE POLICY "Admins can view all leads"
  ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can only view leads assigned to them
CREATE POLICY "Agents can view assigned leads"
  ON public.leads FOR SELECT
  USING (assigned_to = auth.uid());

-- Admins can insert leads (create new leads)
CREATE POLICY "Admins can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update any lead
CREATE POLICY "Admins can update all leads"
  ON public.leads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can update leads assigned to them
-- NOTE: 09_audit_triggers.sql adds restrictions on which columns agents can change
CREATE POLICY "Agents can update assigned leads"
  ON public.leads FOR UPDATE
  USING (assigned_to = auth.uid());

-- Admins can delete leads
CREATE POLICY "Admins can delete leads"
  ON public.leads FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ==================
-- tasks policies
-- ==================

-- Admins can view all tasks
CREATE POLICY "Admins can view all tasks"
  ON public.tasks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can only view tasks assigned to them
CREATE POLICY "Agents can view own tasks"
  ON public.tasks FOR SELECT
  USING (assigned_to = auth.uid());

-- Admins can insert tasks (create and assign tasks)
CREATE POLICY "Admins can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update any task
CREATE POLICY "Admins can update all tasks"
  ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can update tasks assigned to them (e.g., mark as completed)
CREATE POLICY "Agents can update own tasks"
  ON public.tasks FOR UPDATE
  USING (assigned_to = auth.uid());

-- Admins can delete tasks
CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ==================
-- activity_logs policies
-- ==================
-- CRITICAL: This is an append-only audit log. NO UPDATE or DELETE policies.

-- Admins can view all activity (for monitoring)
CREATE POLICY "Admins can view all activity"
  ON public.activity_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own activity
CREATE POLICY "Users can view own activity"
  ON public.activity_logs FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own activity (for client-side logging)
-- Server-side logging uses SECURITY DEFINER functions
CREATE POLICY "Users can insert own activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- NO UPDATE POLICY - Audit logs are immutable
-- NO DELETE POLICY - Audit logs cannot be deleted

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'RLS Policies created:';
  RAISE NOTICE '';
  RAISE NOTICE 'profiles:';
  RAISE NOTICE '  - Admins: SELECT all, INSERT, UPDATE all, DELETE';
  RAISE NOTICE '  - Users: SELECT own, UPDATE own';
  RAISE NOTICE '';
  RAISE NOTICE 'user_roles:';
  RAISE NOTICE '  - Admins: SELECT all, INSERT, UPDATE, DELETE';
  RAISE NOTICE '  - Users: SELECT own only (cannot modify!)';
  RAISE NOTICE '';
  RAISE NOTICE 'leads:';
  RAISE NOTICE '  - Admins: SELECT all, INSERT, UPDATE all, DELETE';
  RAISE NOTICE '  - Agents: SELECT assigned, UPDATE assigned';
  RAISE NOTICE '';
  RAISE NOTICE 'tasks:';
  RAISE NOTICE '  - Admins: SELECT all, INSERT, UPDATE all, DELETE';
  RAISE NOTICE '  - Agents: SELECT assigned, UPDATE assigned';
  RAISE NOTICE '';
  RAISE NOTICE 'activity_logs:';
  RAISE NOTICE '  - Admins: SELECT all';
  RAISE NOTICE '  - Users: SELECT own, INSERT own';
  RAISE NOTICE '  - NO UPDATE or DELETE (immutable!)';
END $$;
