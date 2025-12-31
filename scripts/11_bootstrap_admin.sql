-- ============================================
-- 11_bootstrap_admin.sql
-- SecuredLead CRM - First Admin Setup
-- Run AFTER all other scripts
-- ============================================
-- This script creates the first admin user.
-- 
-- OPTION 1: Create user via Supabase Dashboard
--   1. Go to Authentication > Users
--   2. Click "Add user"
--   3. Enter email/password
--   4. Note the user's UUID
--   5. Run the INSERT statements below with that UUID
--
-- OPTION 2: Use the Edge Function with bootstrap secret
--   The create-user edge function has bootstrap mode for first admin.
--
-- ============================================

-- ==================
-- STEP 1: Create auth.user via Supabase Dashboard
-- ==================
-- 1. Open Supabase Dashboard
-- 2. Go to Authentication > Users
-- 3. Click "Add user" > "Create new user"
-- 4. Enter:
--    Email: your-admin-email@example.com
--    Password: (secure password)
-- 5. Copy the UUID shown after creation

-- ==================
-- STEP 2: Create profile and role
-- ==================
-- Replace 'YOUR-ADMIN-UUID' with the actual UUID from Step 1

/*
-- UNCOMMENT AND MODIFY THIS SECTION AFTER CREATING AUTH USER

-- Create admin profile
INSERT INTO public.profiles (user_id, full_name, email, is_active)
VALUES (
  'YOUR-ADMIN-UUID'::uuid,  -- Replace with actual UUID
  'Admin User',              -- Replace with actual name
  'admin@example.com',       -- Replace with actual email
  true
);

-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
VALUES (
  'YOUR-ADMIN-UUID'::uuid,  -- Same UUID as above
  'admin'::app_role
);

*/

-- ==================
-- VERIFICATION QUERY
-- ==================
-- Run this after setup to verify admin was created correctly:

/*
SELECT 
  p.full_name,
  p.email,
  p.is_active,
  r.role
FROM profiles p
JOIN user_roles r ON p.user_id = r.user_id
WHERE r.role = 'admin';
*/

-- ==================
-- NOTES
-- ==================
DO $$
BEGIN
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'FIRST ADMIN SETUP INSTRUCTIONS';
  RAISE NOTICE '===============================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. Go to Supabase Dashboard > Authentication > Users';
  RAISE NOTICE '2. Click "Add user" > "Create new user"';
  RAISE NOTICE '3. Enter email/password for admin account';
  RAISE NOTICE '4. Copy the UUID of the created user';
  RAISE NOTICE '5. Replace YOUR-ADMIN-UUID in this script';
  RAISE NOTICE '6. Uncomment and run the INSERT statements';
  RAISE NOTICE '7. Run verification query to confirm';
  RAISE NOTICE '';
  RAISE NOTICE 'After first admin is created, use the admin dashboard';
  RAISE NOTICE 'to create additional agents via the UI.';
  RAISE NOTICE '===============================================';
END $$;
