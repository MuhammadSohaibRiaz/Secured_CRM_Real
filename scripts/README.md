# Database Migration Scripts

This directory contains SQL scripts to set up the SecuredLead CRM database in a new Supabase project.

## Execution Order

**Run these scripts in order in the Supabase SQL Editor:**

| # | Script | Purpose |
|---|--------|---------|
| 1 | `01_enums.sql` | Create enum types (app_role, lead_status, etc.) |
| 2 | `02_tables.sql` | Create core tables with RLS enabled |
| 3 | `03_foreign_keys.sql` | Add referential integrity constraints |
| 4 | `04_indexes.sql` | Add performance indexes |
| 5 | `05_functions.sql` | Create helper functions (has_role, mask_*, etc.) |
| 6 | `06_views.sql` | Create leads_masked view |
| 7 | `07_triggers.sql` | Add updated_at and last_login triggers |
| 8 | `08_rls_policies.sql` | Set up Row Level Security policies |
| 9 | `09_audit_triggers.sql` | Add automatic CRUD audit logging |
| 10 | `10_realtime.sql` | Enable Supabase Realtime |
| 11 | `11_bootstrap_admin.sql` | Create first admin user (manual step) |

## Quick Start

```sql
-- Run in Supabase SQL Editor in order:
-- 01_enums.sql
-- 02_tables.sql
-- ... and so on
```

## After Migration

1. **Create First Admin**: Follow instructions in `11_bootstrap_admin.sql`
2. **Update Frontend .env**: Set new Supabase URL and anon key
3. **Deploy Edge Functions**: Deploy functions from `supabase/functions/`
4. **Test Login**: Verify admin can login and access dashboard

## Security Features Enabled

- ✅ Row Level Security on all tables
- ✅ Separate user_roles table (prevents privilege escalation)
- ✅ PII masking via leads_masked view
- ✅ Rate-limited PII reveal (20/hour)
- ✅ Immutable audit logs (no UPDATE/DELETE)
- ✅ Agent field restrictions (cannot reassign leads)
- ✅ Automatic CRUD logging via triggers

## Rollback

If you need to start over:

```sql
-- DROP EVERYTHING (BE CAREFUL!)
DROP VIEW IF EXISTS public.leads_masked;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.lead_status CASCADE;
DROP TYPE IF EXISTS public.task_priority CASCADE;
DROP TYPE IF EXISTS public.task_status CASCADE;
```

## Troubleshooting

### "permission denied for table auth.users"
The `on_auth_user_login` trigger in `07_triggers.sql` may fail due to permissions. This trigger can be created via Supabase Dashboard instead.

### "function auth.uid() does not exist"
Make sure you're running scripts in Supabase SQL Editor, not a local Postgres instance. The `auth` schema is Supabase-specific.

### RLS policies blocking access
Verify the user has a row in `user_roles` with the correct role. Check with:
```sql
SELECT * FROM user_roles WHERE user_id = 'YOUR-UUID';
```
