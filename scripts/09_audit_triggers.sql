-- ============================================
-- 09_audit_triggers.sql
-- SecuredLead CRM - Audit Logging Triggers
-- Run AFTER 08_rls_policies.sql
-- ============================================
-- These triggers automatically log all data changes to activity_logs.
-- This ensures complete audit trail without relying on frontend.

-- ==================
-- Agent field change restrictions
-- ==================
-- Prevent agents from modifying certain fields they shouldn't change.

CREATE OR REPLACE FUNCTION public.enforce_agent_update_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Skip check for admins
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  
  -- For leads table
  IF TG_TABLE_NAME = 'leads' THEN
    -- Agents cannot change who the lead is assigned to
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      RAISE EXCEPTION 'Permission denied: Agents cannot reassign leads';
    END IF;
    
    -- Agents cannot change who created the lead
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Permission denied: Agents cannot modify lead creator';
    END IF;
  END IF;
  
  -- For tasks table
  IF TG_TABLE_NAME = 'tasks' THEN
    -- Agents cannot change who the task is assigned to
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      RAISE EXCEPTION 'Permission denied: Agents cannot reassign tasks';
    END IF;
    
    -- Agents cannot change who created the task
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Permission denied: Agents cannot modify task creator';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply to leads
CREATE TRIGGER enforce_lead_agent_restrictions
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agent_update_restrictions();

-- Apply to tasks
CREATE TRIGGER enforce_task_agent_restrictions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agent_update_restrictions();

-- ==================
-- Lead audit logging
-- ==================
-- Log all INSERT, UPDATE, DELETE operations on leads.

CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  changes jsonb := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      COALESCE(auth.uid(), NEW.created_by),
      'lead_created',
      'lead',
      NEW.id,
      jsonb_build_object(
        'name', NEW.name,
        'status', NEW.status,
        'assigned_to', NEW.assigned_to,
        'source', NEW.source
      )
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Track what changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      changes := changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      changes := changes || jsonb_build_object('assigned_to', jsonb_build_object('old', OLD.assigned_to, 'new', NEW.assigned_to));
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      changes := changes || jsonb_build_object('notes_updated', true);
    END IF;
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      changes := changes || jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', NEW.name));
    END IF;
    
    -- Only log if something meaningful changed (not just updated_at)
    IF changes != '{}' THEN
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (
        auth.uid(),
        'lead_updated',
        'lead',
        NEW.id,
        jsonb_build_object('changes', changes)
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'lead_deleted',
      'lead',
      OLD.id,
      jsonb_build_object(
        'name', OLD.name,
        'status', OLD.status,
        'deleted_at', now()
      )
    );
    RETURN OLD;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_lead_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_changes();

-- ==================
-- Task audit logging
-- ==================

CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  changes jsonb := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      COALESCE(auth.uid(), NEW.created_by),
      'task_created',
      'task',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'status', NEW.status,
        'priority', NEW.priority,
        'assigned_to', NEW.assigned_to
      )
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      changes := changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      changes := changes || jsonb_build_object('priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority));
    END IF;
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      changes := changes || jsonb_build_object('assigned_to', jsonb_build_object('old', OLD.assigned_to, 'new', NEW.assigned_to));
    END IF;
    
    IF changes != '{}' THEN
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (
        auth.uid(),
        'task_updated',
        'task',
        NEW.id,
        jsonb_build_object('changes', changes)
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'task_deleted',
      'task',
      OLD.id,
      jsonb_build_object(
        'title', OLD.title,
        'deleted_at', now()
      )
    );
    RETURN OLD;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_task_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_changes();

-- ==================
-- Profile status audit logging (kill switch)
-- ==================

CREATE OR REPLACE FUNCTION public.log_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only log if is_active changed (kill switch used)
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      CASE WHEN NEW.is_active THEN 'agent_enabled' ELSE 'agent_disabled' END,
      'profile',
      NEW.user_id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_name', NEW.full_name,
        'new_status', NEW.is_active,
        'timestamp', now()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_profile_status
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_status_change();

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Audit triggers created:';
  RAISE NOTICE '';
  RAISE NOTICE 'Restriction triggers (prevent unauthorized changes):';
  RAISE NOTICE '  - enforce_lead_agent_restrictions';
  RAISE NOTICE '  - enforce_task_agent_restrictions';
  RAISE NOTICE '';
  RAISE NOTICE 'Audit logging triggers:';
  RAISE NOTICE '  - audit_lead_changes (INSERT/UPDATE/DELETE)';
  RAISE NOTICE '  - audit_task_changes (INSERT/UPDATE/DELETE)';
  RAISE NOTICE '  - audit_profile_status (is_active changes)';
  RAISE NOTICE '';
  RAISE NOTICE 'All CRUD operations are now automatically logged!';
END $$;
