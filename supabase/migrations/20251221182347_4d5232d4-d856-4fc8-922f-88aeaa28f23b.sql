-- Fix mask_email function with proper search_path
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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
  
  IF domain_part = '' THEN
    RETURN '***@***';
  END IF;
  
  IF length(local_part) > 1 THEN
    masked_local := left(local_part, 1) || repeat('*', LEAST(length(local_part) - 1, 5));
  ELSE
    masked_local := '*';
  END IF;
  
  RETURN masked_local || '@' || domain_part;
END;
$$;

-- Fix mask_phone function with proper search_path
CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits text;
  last_four text;
  masked_part text;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  digits := regexp_replace(phone, '[^0-9]', '', 'g');
  
  IF length(digits) < 4 THEN
    RETURN repeat('*', length(phone));
  END IF;
  
  last_four := right(digits, 4);
  masked_part := repeat('*', GREATEST(length(digits) - 4, 0));
  
  IF phone LIKE '%(%)%' THEN
    RETURN '(***) ***-' || last_four;
  ELSE
    RETURN masked_part || last_four;
  END IF;
END;
$$;

-- Drop and recreate the view with SECURITY INVOKER (default, no security definer)
DROP VIEW IF EXISTS public.leads_masked;

CREATE VIEW public.leads_masked 
WITH (security_invoker = true)
AS
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

GRANT SELECT ON public.leads_masked TO authenticated;