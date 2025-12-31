# Database Schema Security Analysis: SecuredLead CRM

> **Document Type**: Database Security & Scalability Review  
> **Date**: 2025-12-31  
> **Scope**: Complete Postgres schema for production deployment  
> **Assumption**: Frontend is untrusted, agents are semi-adversarial

---

## Executive Summary

| Category | Assessment |
|----------|------------|
| **Role-Based Access** | ✅ Strong - Separate `user_roles` table, SECURITY DEFINER functions |
| **PII Masking** | ✅ Strong - Database-level masking via view |
| **Rate Limiting** | ✅ Strong - Server-side enforcement in PostgreSQL |
| **Audit Trail** | ⚠️ Partial - INSERT-only, but gaps in coverage |
| **RLS Policies** | ⚠️ Mostly Strong - Some edge cases need attention |
| **Scalability** | ⚠️ Needs Indexing - Missing indexes for common queries |
| **Foreign Keys** | 🔴 Missing - No referential integrity constraints |

---

## 1. Schema Validation

### 1.1 Table Structure Review

| Table | Primary Key | Issues Found |
|-------|-------------|--------------|
| `profiles` | `id` (uuid) | ✅ Correct: `user_id` is UNIQUE, separate from PK |
| `user_roles` | `id` (uuid) | ✅ Correct: UNIQUE constraint on `(user_id, role)` |
| `leads` | `id` (uuid) | ⚠️ Missing FK constraints on `assigned_to`, `created_by` |
| `tasks` | `id` (uuid) | ⚠️ Missing FK constraints on `assigned_to`, `created_by` |
| `activity_logs` | `id` (uuid) | ⚠️ Missing FK on `user_id`, `entity_id` is polymorphic |

### 1.2 Missing Foreign Key Constraints

**Risk**: Data integrity issues—orphaned records possible.

```sql
-- RECOMMENDED: Add foreign key constraints

ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_created_by 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.leads
  ADD CONSTRAINT fk_leads_assigned_to 
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD CONSTRAINT fk_leads_created_by 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_assigned_to 
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_created_by 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT fk_activity_logs_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
-- Note: entity_id cannot have FK due to polymorphic nature
```

### 1.3 Missing Indexes (Scalability)

**Risk**: Query performance degrades with data growth.

```sql
-- RECOMMENDED: Add indexes for common query patterns

-- User lookups
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_profiles_is_active ON public.profiles(user_id) WHERE is_active = true;

-- Lead queries by agent
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- Task queries
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date) WHERE status != 'completed';

-- Activity log queries (critical for rate limiting)
CREATE INDEX idx_activity_logs_user_action_time 
  ON public.activity_logs(user_id, action, created_at DESC);
CREATE INDEX idx_activity_logs_entity 
  ON public.activity_logs(entity_type, entity_id);
```

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    RBAC ENFORCEMENT LAYERS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: auth.users (Supabase Managed)                         │
│     └── JWT contains user.id, email                             │
│                                                                 │
│  Layer 2: user_roles table                                      │
│     └── Maps user_id → app_role ('admin' | 'agent')            │
│     └── SECURITY: Separate from profiles (no self-escalation)  │
│                                                                 │
│  Layer 3: SECURITY DEFINER functions                            │
│     └── has_role(_user_id, _role) → bypasses RLS               │
│     └── get_user_role(_user_id) → bypasses RLS                 │
│     └── is_user_active(_user_id) → bypasses RLS                │
│                                                                 │
│  Layer 4: RLS Policies                                          │
│     └── Use has_role() for admin checks                         │
│     └── Use auth.uid() for ownership checks                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Why Separate `user_roles` Table is Correct

| Design Choice | Security Benefit |
|---------------|------------------|
| Roles in separate table | Users cannot UPDATE their own role via profiles table |
| RLS on `user_roles` | Only admins can INSERT/UPDATE/DELETE roles |
| No roles in JWT claims | Cannot forge role by manipulating token |
| SECURITY DEFINER for checks | Avoids RLS recursion, fast lookup |

### 2.3 Privilege Escalation Vectors

| Vector | Status | Analysis |
|--------|--------|----------|
| User modifies own role | ✅ Blocked | RLS: only admin can INSERT/UPDATE on `user_roles` |
| User creates admin role | ✅ Blocked | WITH CHECK requires `has_role(auth.uid(), 'admin')` |
| User deletes own profile to re-register | ⚠️ Possible | If auth.user persists without profile, could re-register |
| Admin creates second admin | ⚠️ Allowed | Current schema allows admin→admin creation |
| SQL injection in role check | ✅ Safe | `has_role` uses parameterized query |

**Recommendation**: Consider adding a constraint or trigger to prevent creating additional admins, or require super-admin approval.

---

## 3. PII Masking & Controlled Reveal

### 3.1 Masking Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PII MASKING FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RAW DATA (leads table)                                         │
│     email: 'john.doe@company.com'                               │
│     phone: '+1 (555) 123-4567'                                  │
│                                                                 │
│           ↓ mask_email() / mask_phone()                         │
│                                                                 │
│  MASKED DATA (leads_masked view)                                │
│     email: 'j*****@company.com'                                 │
│     phone: '(***) ***-4567'                                    │
│                                                                 │
│  NOTE: Raw data accessible via:                                 │
│    1. reveal_lead_pii() function (rate-limited, logged)        │
│    2. Direct leads table query (if RLS allows)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Masking Function Analysis

**`mask_email`**:
```sql
-- Transforms: 'john.doe@company.com' → 'j*****@company.com'
-- Edge cases handled:
--   NULL → NULL ✅
--   'a@b.com' → 'a@b.com' (1 char local) ⚠️ Reveals full local part
--   'no-at-sign' → '***@***' ✅
--   '' → '***@***' (empty string)
```

**`mask_phone`**:
```sql
-- Transforms: '+1 (555) 123-4567' → '(***) ***-4567'
-- Edge cases handled:
--   NULL → NULL ✅
--   '123' → '***' (< 4 digits) ✅
--   '1234567890' → '******7890' ✅
```

### 3.3 Controlled Reveal Analysis (`reveal_lead_pii`)

**Security Strengths**:

| Feature | Implementation | Verdict |
|---------|----------------|---------|
| Authentication | `auth.uid()` required | ✅ Strong |
| Authorization (admin) | `user_role = 'admin'` bypass | ✅ Correct |
| Authorization (agent) | `lead_record.assigned_to != auth.uid()` check | ✅ Correct |
| Rate limiting | COUNT from activity_logs in 1 hour window | ✅ Strong |
| Audit logging | INSERT into activity_logs | ✅ Comprehensive |
| Field validation | Only 'email' or 'phone' allowed | ✅ Safe |

**Potential Issues**:

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Rate limit per user, not per lead | Agent can reveal 20 different leads/hour | Consider per-lead cooldown |
| No IP logging in function | Cannot trace reveals to IP | Add IP from edge function |
| Rate limit uses activity_logs | If logs are deleted, limit resets | Covered by no DELETE policy on logs |
| TOCTOU race condition | Two concurrent calls might bypass count | Use `FOR UPDATE` or `SERIALIZABLE` |

**Race Condition Fix**:
```sql
-- RECOMMENDED: Add locking to prevent TOCTOU
LOCK TABLE activity_logs IN SHARE MODE; -- Or use advisory lock
-- Alternative: Use SELECT ... FOR UPDATE on a rate_limit_counter table
```

### 3.4 View Security for `leads_masked`

**Critical Question**: Does RLS apply to the view?

```sql
-- Current view definition:
CREATE VIEW public.leads_masked AS
SELECT ... FROM public.leads;
```

**Answer**: YES, RLS applies because:
1. Views in PostgreSQL inherit RLS from underlying tables by default
2. The view is not `SECURITY DEFINER`
3. Supabase executes view queries as the calling user

**Verification**: When agent queries `leads_masked`, they only see rows where `assigned_to = auth.uid()` due to the RLS policy on `leads` table.

---

## 4. Activity Logs Audit Trail Evaluation

### 4.1 Immutability Assessment

| Operation | Policy Exists | Verdict |
|-----------|---------------|---------|
| SELECT | Admins all, users own | ✅ Appropriate |
| INSERT | Users own | ✅ Allows logging |
| UPDATE | None | ✅ Immutable |
| DELETE | None | ✅ Immutable |

**Verdict**: ✅ Activity logs are append-only. Users cannot modify or delete their own logs.

### 4.2 Coverage Gaps

| Action | Currently Logged? | Risk |
|--------|-------------------|------|
| PII reveal (email/phone) | ✅ Yes (in `reveal_lead_pii`) | None |
| Lead created | ❌ No | Lost audit trail for data origin |
| Lead updated (any field) | ❌ No | Cannot track who changed what |
| Lead deleted | ❌ No | Cannot prove data was destroyed |
| Lead assigned/reassigned | ❌ No | Cannot trace access changes |
| Task created/updated | ❌ No | No task audit trail |
| Agent created | ❌ No | Administrative actions untracked |
| Agent deactivated | ⚠️ Frontend only | Should be database trigger |
| Password reset | ❌ No | Credential changes untracked |
| Login success/failure | ❌ No | No authentication audit |

### 4.3 Recommended Audit Triggers

```sql
-- RECOMMENDED: Add audit triggers for CRUD operations

CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'lead_created',
      'lead',
      NEW.id,
      jsonb_build_object('name', NEW.name, 'status', NEW.status)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'lead_updated',
      'lead',
      NEW.id,
      jsonb_build_object(
        'changes', jsonb_build_object(
          'status', CASE WHEN OLD.status != NEW.status 
                        THEN jsonb_build_object('old', OLD.status, 'new', NEW.status) 
                        ELSE NULL END,
          'assigned_to', CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to 
                             THEN jsonb_build_object('old', OLD.assigned_to, 'new', NEW.assigned_to) 
                             ELSE NULL END
        )
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'lead_deleted',
      'lead',
      OLD.id,
      jsonb_build_object('name', OLD.name, 'deleted_at', now())
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_lead_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_changes();
```

### 4.4 Log Retention Considerations

| Consideration | Current State | Recommendation |
|---------------|---------------|----------------|
| Log volume growth | Unbounded | Add `archived_at` column and archive policy |
| Log search performance | No partitioning | Partition by `created_at` monthly |
| Compliance retention | Not defined | Define 1-7 year retention based on jurisdiction |
| Log backup | Uses Supabase | Ensure point-in-time recovery enabled |

---

## 5. RLS Policy Deep Dive

### 5.1 Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Admin: all / User: own | Admin | Admin + User own | Admin |
| user_roles | Admin: all / User: own | Admin | Admin | Admin |
| leads | Admin: all / Agent: assigned | Admin | Admin + Agent assigned | Admin |
| tasks | Admin: all / Agent: assigned | Admin | Admin + Agent assigned | Admin |
| activity_logs | Admin: all / User: own | User own | None | None |

### 5.2 Potential Issues

#### Issue 1: Agent Can Update Any Field on Assigned Lead

```sql
-- Current policy:
CREATE POLICY "Agents can update assigned leads"
  ON public.leads FOR UPDATE
  USING (assigned_to = auth.uid());
```

**Risk**: Agent can modify:
- `assigned_to` → Reassign to another agent or NULL
- `created_by` → Forge creation history
- `email`/`phone` → Modify PII (though it's their assigned lead)

**Recommendation**: Add column restrictions.

```sql
-- RECOMMENDED: Restrict which columns agents can update
CREATE POLICY "Agents can update assigned leads limited"
  ON public.leads FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (
    -- Prevent changing assignment
    assigned_to = auth.uid() AND
    -- Prevent changing created_by
    created_by IS NOT DISTINCT FROM (SELECT created_by FROM leads WHERE id = leads.id)
  );
```

Or use a trigger:
```sql
CREATE OR REPLACE FUNCTION public.prevent_agent_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    -- Agents cannot change these fields
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      RAISE EXCEPTION 'Agents cannot reassign leads';
    END IF;
    IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Agents cannot change lead creator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_agent_update_limits
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_agent_field_changes();
```

#### Issue 2: First Admin Bootstrap Chicken-and-Egg

**Problem**: RLS requires admin to create roles, but first admin needs a role to exist.

**Current Solution**: Edge function with `ADMIN_BOOTSTRAP_SECRET`.

**Risk**: If secret is leaked, anyone can create admins.

**Recommendations**:
1. Remove `ADMIN_BOOTSTRAP_SECRET` after first admin created
2. Or: Add database constraint allowing only ONE admin creation via bootstrap
3. Or: Use Supabase dashboard to insert first admin directly

#### Issue 3: `has_role` Called in Every RLS Check

**Performance Risk**: Every SELECT/UPDATE/DELETE triggers `has_role()` function call.

**Current Optimization**: Function is `STABLE` (cacheable within transaction).

**Further Optimization**:
```sql
-- Consider using session variable for caching
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  cached_role app_role;
BEGIN
  -- Try to get from session cache
  BEGIN
    cached_role := current_setting('app.current_role', true)::app_role;
    IF cached_role IS NOT NULL THEN
      RETURN cached_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Fetch and cache
  SELECT role INTO cached_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  PERFORM set_config('app.current_role', cached_role::text, true);
  RETURN cached_role;
END;
$$;
```

### 5.3 RLS Bypass Risks

| Bypass Vector | Status | Notes |
|---------------|--------|-------|
| Direct table access bypassing view | ⚠️ Possible | If client queries `leads` instead of `leads_masked`, raw PII exposed |
| Service role key | 🔴 Bypasses RLS | Keep service key server-side only |
| SECURITY DEFINER functions | ⚠️ Can bypass | Current functions are safe (minimal scope) |
| SQL injection in function params | ✅ Safe | All params properly typed |
| Supabase realtime | ⚠️ Needs review | Ensure realtime respects RLS |

**Critical**: The `leads` table is NOT restricted to `leads_masked` view. Any Supabase client can query `leads` directly and receive raw PII (filtered by RLS, but with actual email/phone values).

**Recommendation**: Either:
1. Remove direct client access to `leads` table (use RPC only)
2. Or add a trigger that masks PII on SELECT (complex)
3. Or accept that RLS is the security boundary (current design)

---

## 6. SECURITY DEFINER Function Review

### 6.1 Current Functions

| Function | Uses SECURITY DEFINER | Risk Assessment |
|----------|----------------------|-----------------|
| `has_role` | ✅ Yes | ✅ Safe - reads `user_roles`, no side effects |
| `get_user_role` | ✅ Yes | ✅ Safe - reads `user_roles`, no side effects |
| `is_user_active` | ✅ Yes | ✅ Safe - reads `profiles`, no side effects |
| `reveal_lead_pii` | ✅ Yes | ⚠️ Complex - bypasses RLS on `leads`, `activity_logs` |
| `update_last_login` | ✅ Yes | ✅ Safe - writes `profiles.last_login_at` only |
| `mask_email` | ❌ No | ✅ Safe - pure function |
| `mask_phone` | ❌ No | ✅ Safe - pure function |
| `update_updated_at_column` | ❌ No | ✅ Safe - trigger function |

### 6.2 `reveal_lead_pii` Detailed Review

```sql
-- Privilege: Can bypass RLS on leads table (SELECT * FROM leads)
-- Privilege: Can bypass RLS on activity_logs (INSERT)
-- Privilege: Can bypass RLS on user_roles (SELECT role)
```

**Security Controls in Function**:
1. ✅ Validates `auth.uid()` exists
2. ✅ Checks user role
3. ✅ Checks lead assignment for agents
4. ✅ Enforces rate limit
5. ✅ Logs every reveal

**Potential Issues**:
- If `auth.uid()` is NULL (unauthenticated), function still executes but will fail on role lookup
- No explicit check for `auth.uid() IS NOT NULL`

**Recommended Addition**:
```sql
-- Add at start of function:
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required';
END IF;
```

### 6.3 Function Ownership

All functions should be owned by `postgres` (service role), not `anon` or `authenticated`.

```sql
-- Verify ownership:
SELECT proname, proowner::regrole 
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace;
```

---

## 7. Database vs Backend Logic Placement

### 7.1 Current Distribution

| Logic | Current Location | Correct Placement |
|-------|------------------|-------------------|
| Role checking | DB (`has_role`) | ✅ Correct |
| PII masking | DB (view + functions) | ✅ Correct |
| Rate limiting | DB (`reveal_lead_pii`) | ✅ Correct |
| Audit logging | Mixed (DB + frontend) | ⚠️ Should be DB only |
| User creation | Edge function | ✅ Correct (uses service role) |
| Password reset | Edge function | ✅ Correct (uses service role) |
| Email notifications | Edge function | ✅ Correct |
| Kill switch | DB + frontend | ⚠️ DB trigger would be more reliable |

### 7.2 Logic That Should Move to Database

#### 1. Agent Deactivation Should Trigger Audit Log

```sql
-- RECOMMENDED: Add trigger for profile deactivation
CREATE OR REPLACE FUNCTION public.log_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.is_active != NEW.is_active THEN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      CASE WHEN NEW.is_active THEN 'agent_enabled' ELSE 'agent_disabled' END,
      'profile',
      NEW.user_id,
      jsonb_build_object(
        'target_user', NEW.user_id,
        'target_name', NEW.full_name,
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
```

#### 2. Lead Changes Should Be Logged by Trigger (Not Frontend)

See Section 4.3 for implementation.

### 7.3 Logic Correctly in Backend (Edge Functions)

| Operation | Why Backend is Correct |
|-----------|----------------------|
| User creation | Requires `auth.admin.createUser` - service role only |
| Password reset | Requires `auth.admin.updateUserById` - service role only |
| Email sending | External API call, should not be in DB |
| IP capture | Requires HTTP headers access |

---

## 8. Production Hardening Recommendations

### 8.1 Critical (Must Fix Before Production)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Missing foreign keys | Add FK constraints (Section 1.2) |
| 2 | Missing indexes | Add indexes (Section 1.3) |
| 3 | Agent can reassign leads | Add trigger to prevent (Section 5.2) |
| 4 | Audit gaps | Add audit triggers for CRUD (Section 4.3) |
| 5 | No auth check in `reveal_lead_pii` | Add `auth.uid() IS NULL` check |

### 8.2 High Priority (Should Fix)

| # | Issue | Fix |
|---|-------|-----|
| 6 | Rate limit race condition | Add locking or use counter table |
| 7 | Bootstrap secret persists | Remove after first admin or add usage limit |
| 8 | No per-lead reveal cooldown | Add 5-minute cooldown per lead |
| 9 | Realtime exposes unhashed data | Verify realtime respects RLS |
| 10 | No login audit | Add trigger on `auth.users.last_sign_in_at` |

### 8.3 Recommended (Nice to Have)

| # | Enhancement |
|---|-------------|
| 11 | Add `archived_at` to leads for soft delete |
| 12 | Partition `activity_logs` by month |
| 13 | Add `ip_address` column to `activity_logs` |
| 14 | Add `session_id` to track reveal sessions |
| 15 | Implement role-based column masking (pg_catalog approach) |

### 8.4 Production Checklist

```markdown
- [ ] Run migration script in order: enums → tables → FKs → indexes → functions → views → triggers → policies
- [ ] Verify RLS is enabled on all tables
- [ ] Test RLS as both admin and agent roles
- [ ] Create first admin via bootstrap, then REMOVE bootstrap secret
- [ ] Enable point-in-time recovery in Supabase
- [ ] Set up database backups
- [ ] Enable query logging for debugging
- [ ] Set connection pool limits
- [ ] Monitor query performance after launch
- [ ] Set up alerting for suspicious activity_logs patterns
```

---

## 9. Summary

### Strengths of Current Design

1. **Defense-in-Depth**: Multiple layers (RLS, SECURITY DEFINER, view masking)
2. **Separation of Concerns**: Roles in separate table, profiles separate from auth
3. **Server-Enforced Security**: Rate limits, PII reveal in PostgreSQL (not client)
4. **Immutable Audit Trail**: No UPDATE/DELETE on activity_logs
5. **Clever RLS Recursion Fix**: SECURITY DEFINER functions for role checks

### Weak Points

1. **No Foreign Keys**: Data integrity relies on application logic
2. **No Indexes**: Will degrade performance at scale
3. **Agent Can Modify Assignment**: Needs trigger protection
4. **Inconsistent Audit Coverage**: CRUD not logged, only reveals
5. **Race Condition in Rate Limit**: Concurrent requests may bypass

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation Priority |
|------|------------|--------|---------------------|
| Agent reassigns lead to self | Medium | Medium | High (add trigger) |
| Orphaned records | Low | Medium | Medium (add FKs) |
| Performance degradation | High (at scale) | High | High (add indexes) |
| Rate limit bypass | Low | Medium | Medium (add locking) |
| Bootstrap secret leaked | Low | Critical | High (remove after use) |
| PII exposed via direct table query | Medium | High | Medium (accepted by design) |

---

*This analysis assumes the database will be the authoritative source of truth and that all frontend code is untrusted.*
