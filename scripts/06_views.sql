-- ============================================
-- 06_views.sql
-- SecuredLead CRM - Database Views
-- Run AFTER 05_functions.sql
-- ============================================

-- ==================
-- leads_masked view
-- ==================
-- A view that masks PII fields (email, phone) using masking functions.
-- This view should be used by the frontend instead of the leads table directly.
-- RLS policies on the underlying leads table still apply.

CREATE OR REPLACE VIEW public.leads_masked WITH (security_invoker = true) AS
SELECT
  id,
  name,
  public.mask_email(email) AS email,  -- Masked: j*****@company.com
  public.mask_phone(phone) AS phone,  -- Masked: (***) ***-4567
  company,
  source,
  notes,
  status,
  assigned_to,
  created_by,
  created_at,
  updated_at
FROM public.leads;

COMMENT ON VIEW public.leads_masked IS 'Leads with PII fields masked. Use reveal_lead_pii() to get raw values.';

-- Verify creation
DO $$
BEGIN
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - leads_masked (masks email and phone fields)';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  Frontend should query leads_masked instead of leads directly.';
  RAISE NOTICE '  To reveal PII, use: SELECT reveal_lead_pii(lead_id, ''email'')';
END $$;
