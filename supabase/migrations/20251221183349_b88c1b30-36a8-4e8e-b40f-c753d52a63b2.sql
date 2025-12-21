-- Update reveal_lead_pii function with rate limiting (20 reveals per hour)
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
  reveal_count integer;
  rate_limit_window interval := interval '1 hour';
  max_reveals_per_hour integer := 20;
BEGIN
  -- Get user's role
  SELECT role INTO user_role FROM user_roles WHERE user_id = auth.uid();
  
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