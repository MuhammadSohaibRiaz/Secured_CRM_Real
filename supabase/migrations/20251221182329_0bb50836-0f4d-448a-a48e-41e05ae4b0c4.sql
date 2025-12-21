-- Create masking functions for email
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  local_part text;
  domain_part text;
  masked_local text;
BEGIN
  IF email IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Split email into local and domain parts
  local_part := split_part(email, '@', 1);
  domain_part := split_part(email, '@', 2);
  
  IF domain_part = '' THEN
    RETURN '***@***';
  END IF;
  
  -- Mask local part: show first character, then asterisks
  IF length(local_part) > 1 THEN
    masked_local := left(local_part, 1) || repeat('*', LEAST(length(local_part) - 1, 5));
  ELSE
    masked_local := '*';
  END IF;
  
  RETURN masked_local || '@' || domain_part;
END;
$$;

-- Create masking function for phone
CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
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
  
  IF length(digits) < 4 THEN
    RETURN repeat('*', length(phone));
  END IF;
  
  -- Get last 4 digits
  last_four := right(digits, 4);
  masked_part := repeat('*', GREATEST(length(digits) - 4, 0));
  
  -- Return formatted masked phone
  IF phone LIKE '%(%)%' THEN
    RETURN '(***) ***-' || last_four;
  ELSE
    RETURN masked_part || last_four;
  END IF;
END;
$$;

-- Create leads_masked view with server-side masking
CREATE OR REPLACE VIEW public.leads_masked AS
SELECT 
  id,
  name,
  public.mask_email(email) as email,
  public.mask_phone(phone) as phone,
  company,
  status,
  source,
  notes,
  assigned_to,
  created_by,
  created_at,
  updated_at
FROM public.leads;

-- Grant access to the view (inherits RLS from underlying table)
GRANT SELECT ON public.leads_masked TO authenticated;

-- Create a function to reveal PII with proper authorization check
CREATE OR REPLACE FUNCTION public.reveal_lead_pii(
  _lead_id uuid,
  _field text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_record leads%ROWTYPE;
  user_role app_role;
  result_value text;
BEGIN
  -- Get user's role
  SELECT role INTO user_role FROM user_roles WHERE user_id = auth.uid();
  
  -- Fetch the lead
  SELECT * INTO lead_record FROM leads WHERE id = _lead_id;
  
  IF lead_record IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  -- Check authorization: admin can see all, agents only assigned leads
  IF user_role = 'admin' THEN
    -- Admin has access
    NULL;
  ELSIF user_role = 'agent' THEN
    IF lead_record.assigned_to != auth.uid() THEN
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
    RAISE EXCEPTION 'Invalid field requested';
  END IF;
  
  -- Log the reveal action
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'revealed_' || _field,
    'lead',
    _lead_id,
    jsonb_build_object(
      'field_type', _field,
      'timestamp', now(),
      'source', 'server'
    )
  );
  
  RETURN result_value;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.reveal_lead_pii(uuid, text) TO authenticated;