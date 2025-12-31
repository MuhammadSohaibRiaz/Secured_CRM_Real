-- ============================================
-- 07_triggers.sql
-- SecuredLead CRM - Database Triggers
-- Run AFTER 06_views.sql
-- ============================================

-- ==================
-- updated_at triggers
-- ==================
-- Automatically update the updated_at column on row updates.

-- Profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Leads
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ==================
-- last_login trigger
-- ==================
-- Updates profiles.last_login_at when auth.users.last_sign_in_at changes.
-- NOTE: This requires special permissions on auth schema.
-- If this fails, the trigger can be created via Supabase Dashboard.

DO $$
BEGIN
  -- Try to create trigger on auth.users
  -- This may fail due to permissions, which is okay
  BEGIN
    CREATE TRIGGER on_auth_user_login
      AFTER UPDATE OF last_sign_in_at ON auth.users
      FOR EACH ROW
      WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
      EXECUTE FUNCTION public.update_last_login();
    
    RAISE NOTICE 'Login tracking trigger created successfully';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create trigger on auth.users (permission denied).';
    RAISE NOTICE 'Create this trigger manually via Supabase Dashboard SQL Editor.';
  END;
END $$;

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Triggers created:';
  RAISE NOTICE '  - update_profiles_updated_at';
  RAISE NOTICE '  - update_leads_updated_at';
  RAISE NOTICE '  - update_tasks_updated_at';
  RAISE NOTICE '  - on_auth_user_login (may require manual creation)';
END $$;
