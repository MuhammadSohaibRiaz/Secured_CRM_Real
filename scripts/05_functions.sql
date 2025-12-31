-- ============================================
-- 05_functions.sql
-- SecuredLead CRM - Database Functions
-- Run AFTER 04_indexes.sql
-- ============================================

-- ==================
-- 1. has_role (SECURITY DEFINER)
-- ==================
-- Checks if a user has a specific role.
-- SECURITY DEFINER bypasses RLS to prevent recursion when used in RLS policies.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

COMMENT ON FUNCTION public.has_role IS 'Check if user has specific role. SECURITY DEFINER to bypass RLS in policies.';

-- ==================
-- 2. get_user_role
-- ==================
-- Returns the role for a given user.

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.get_user_role IS 'Get user role. Returns NULL if no role found.';

-- ==================
-- 3. is_user_active
-- ==================
-- Checks if a user's profile is active (not disabled via kill switch).

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = _user_id),
    false  -- If no profile found, treat as inactive
  )
$$;

COMMENT ON FUNCTION public.is_user_active IS 'Check if user is active (not killed). Returns false if no profile.';

-- ==================
-- 4. mask_email
-- ==================
-- Masks email addresses for privacy (shows first char + domain).

CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  local_part text;
  domain_part text;
  masked_local text;
BEGIN
  IF email IS NULL THEN
    RETURN NULL;
  END IF;
  
  local_part := split_part(email, '@', 1);
  domain_part := split_part(email, '@', 2);
  
  -- Handle invalid emails (no @)
  IF domain_part = '' THEN
    RETURN '***@***';
  END IF;
  
  -- Mask local part: show first char, then up to 5 asterisks
  IF length(local_part) > 1 THEN
    masked_local := left(local_part, 1) || repeat('*', LEAST(length(local_part) - 1, 5));
  ELSE
    masked_local := '*';
  END IF;
  
  RETURN masked_local || '@' || domain_part;
END;
$$;

COMMENT ON FUNCTION public.mask_email IS 'Mask email: john.doe@company.com → j*****@company.com';

-- ==================
-- 5. mask_phone
-- ==================
-- Masks phone numbers for privacy (shows last 4 digits).

CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  digits text;
  last_four text;
  masked_part text;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Extract only digits
  digits := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- If less than 4 digits, mask entirely
  IF length(digits) < 4 THEN
    RETURN repeat('*', length(phone));
  END IF;
  
  last_four := right(digits, 4);
  masked_part := repeat('*', GREATEST(length(digits) - 4, 0));
  
  -- Format based on original format
  IF phone LIKE '%(%)%' THEN
    RETURN '(***) ***-' || last_four;
  ELSE
    RETURN masked_part || last_four;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mask_phone IS 'Mask phone: +1 (555) 123-4567 → (***) ***-4567';

-- ==================
-- 6. update_updated_at_column
-- ==================
-- Trigger function to auto-update updated_at column.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column IS 'Trigger: auto-update updated_at on row update';

-- ==================
-- 7. update_last_login
-- ==================
-- Trigger function to update last_login_at in profiles when user signs in.
-- This triggers on auth.users table updates.

CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_last_login IS 'Trigger: update last_login_at when user signs in';

-- ==================
-- 8. reveal_lead_pii (SECURITY DEFINER)
-- ==================
-- Reveals masked PII fields with rate limiting and audit logging.
-- Rate limit: 20 reveals per hour per user.

CREATE OR REPLACE FUNCTION public.reveal_lead_pii(_lead_id uuid, _field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  lead_record leads%ROWTYPE;
  user_role app_role;
  result_value text;
  reveal_count integer;
  rate_limit_window interval := interval '1 hour';
  max_reveals_per_hour integer := 20;
BEGIN
  -- SECURITY: Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get user's role
  SELECT role INTO user_role 
  FROM user_roles 
  WHERE user_id = auth.uid();
  
  -- Check rate limit: count reveals in the last hour
  SELECT COUNT(*) INTO reveal_count
  FROM activity_logs
  WHERE user_id = auth.uid()
    AND action IN ('revealed_email', 'revealed_phone')
    AND created_at > (now() - rate_limit_window);
  
  IF reveal_count >= max_reveals_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % reveals per hour. Please wait before revealing more data.', max_reveals_per_hour;
  END IF;
  
  -- Fetch the lead
  SELECT * INTO lead_record FROM leads WHERE id = _lead_id;
  
  IF lead_record IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Check authorization: admin can see all, agents only assigned leads
  IF user_role = 'admin' THEN
    -- Admin has access to all leads
    NULL;
  ELSIF user_role = 'agent' THEN
    IF lead_record.assigned_to IS NULL OR lead_record.assigned_to != auth.uid() THEN
      RAISE EXCEPTION 'Access denied: Lead not assigned to you';
    END IF;
  ELSE
    RAISE EXCEPTION 'Access denied: Invalid role';
  END IF;
  
  -- Get the requested field
  IF _field = 'email' THEN
    result_value := lead_record.email;
  ELSIF _field = 'phone' THEN
    result_value := lead_record.phone;
  ELSE
    RAISE EXCEPTION 'Invalid field requested. Must be email or phone.';
  END IF;
  
  -- Log the reveal action with remaining reveals info
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'revealed_' || _field,
    'lead',
    _lead_id,
    jsonb_build_object(
      'field_type', _field,
      'timestamp', now(),
      'source', 'server',
      'reveals_remaining', max_reveals_per_hour - reveal_count - 1
    )
  );
  
  RETURN result_value;
END;
$$;

COMMENT ON FUNCTION public.reveal_lead_pii IS 'Reveal masked PII with rate limiting (20/hour) and audit logging';

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - has_role(user_id, role) → boolean [SECURITY DEFINER]';
  RAISE NOTICE '  - get_user_role(user_id) → app_role [SECURITY DEFINER]';
  RAISE NOTICE '  - is_user_active(user_id) → boolean [SECURITY DEFINER]';
  RAISE NOTICE '  - mask_email(text) → text [IMMUTABLE]';
  RAISE NOTICE '  - mask_phone(text) → text [IMMUTABLE]';
  RAISE NOTICE '  - update_updated_at_column() → trigger';
  RAISE NOTICE '  - update_last_login() → trigger [SECURITY DEFINER]';
  RAISE NOTICE '  - reveal_lead_pii(lead_id, field) → text [SECURITY DEFINER]';
END $$;
