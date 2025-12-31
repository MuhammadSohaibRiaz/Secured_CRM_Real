# SecuredLead CRM: Architecture & Migration Roadmap

> **Document Type**: Technical Architecture & Implementation Plan  
> **Date**: 2025-12-31  
> **Status**: Phase 1 Ready for Implementation  
> **Goal**: Migrate from Lovable-hosted system to self-managed, backend-controlled, SaaS-grade platform

---

## Executive Summary

This document outlines the evolution of SecuredLead CRM from a Lovable-prototyped frontend with direct Supabase access to a production-ready, SaaS-grade system with:

1. **Self-managed Supabase** as the database layer
2. **Dedicated backend service** as the authoritative API layer
3. **Existing Lovable frontend** connected through the backend
4. **Future integrations**: Google Sheets sync, Gemini AI, email workflows, scheduling

---

## 1. Target Architecture

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                 │
│  │   React SPA     │    │  Google Sheets  │    │   Mobile App    │                 │
│  │  (Lovable UI)   │    │   (Sync Layer)  │    │    (Future)     │                 │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘                 │
│           │                      │                      │                           │
│           └──────────────────────┼──────────────────────┘                           │
│                                  ▼                                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTPS (JWT Auth)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 BACKEND LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐               │
│  │                     Node.js / Express Backend                    │               │
│  │  (or Supabase Edge Functions for Phase 1)                       │               │
│  ├─────────────────────────────────────────────────────────────────┤               │
│  │                                                                 │               │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │               │
│  │  │ Auth Guard  │  │ Rate Limiter│  │ Validator   │            │               │
│  │  │ (JWT verify)│  │ (per user)  │  │ (Zod/Joi)   │            │               │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │               │
│  │                                                                 │               │
│  │  ┌────────────────────────────────────────────────────────┐   │               │
│  │  │                    API ROUTES                          │   │               │
│  │  │  /leads      /tasks      /agents      /activity       │   │               │
│  │  │  /reveal-pii /reports    /sync        /health         │   │               │
│  │  └────────────────────────────────────────────────────────┘   │               │
│  │                                                                 │               │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │               │
│  │  │ Sheets Sync │  │ Email Queue │  │ Scheduler   │            │               │
│  │  │  (Phase 2)  │  │  (Phase 3)  │  │ (Phase 3)   │            │               │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │               │
│  │                                                                 │               │
│  └──────────────────────────────┬──────────────────────────────────┘               │
│                                 │                                                   │
└─────────────────────────────────┼───────────────────────────────────────────────────┘
                                  │
                                  │ Service Role (secure)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                DATABASE LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐               │
│  │                    Supabase (Self-Managed)                       │               │
│  ├─────────────────────────────────────────────────────────────────┤               │
│  │                                                                 │               │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │               │
│  │  │  PostgreSQL │  │   Realtime  │  │ Edge Funcs  │            │               │
│  │  │  + RLS      │  │  (pub/sub)  │  │  (helpers)  │            │               │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │               │
│  │                                                                 │               │
│  │  Security Enforcement:                                         │               │
│  │  • Row Level Security (RLS) on all tables                      │               │
│  │  • PII masking via leads_masked view                           │               │
│  │  • Audit triggers for all CRUD operations                      │               │
│  │  • Rate-limited reveal_lead_pii() function                     │               │
│  │                                                                 │               │
│  └─────────────────────────────────────────────────────────────────┘               │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Triggered by data changes / schedules
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              AI & INTEGRATION LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Gemini API    │    │  Google Sheets  │    │   Email Service │                 │
│  │  (Background)   │    │   (2-way sync)  │    │    (Resend)     │                 │
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────┤                 │
│  │ • Lead scoring  │    │ • Bulk import   │    │ • Notifications │                 │
│  │ • Summaries     │    │ • Bulk export   │    │ • Drip campaigns│                 │
│  │ • Predictions   │    │ • Live sync     │    │ • Reminders     │                 │
│  │ • Benchmarks    │    │ • Conflict res  │    │ • Inbound parse │                 │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘                 │
│                                                                                     │
│  Execution Model:                                                                   │
│  • NO chat UI (silent background processing)                                        │
│  • Triggered by: DB changes (webhooks), schedules (cron), batch jobs              │
│  • Results written back to database (AI-generated fields)                          │
│  • Cost-controlled via queuing and throttling                                       │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Responsibility | Trust Level |
|-------|---------------|-------------|
| **Frontend** | UI rendering, user input, optimistic updates | ❌ Untrusted |
| **Backend** | Validation, orchestration, AI/sync triggers | ✅ Trusted |
| **Database** | Data storage, RLS, audit, PII masking | ✅ Trusted (source of truth) |
| **AI/Integrations** | Background processing, external syncs | ✅ Trusted (server-side) |

---

## 2. Logic Placement Matrix

### 2.1 Keep in Database

| Logic | Current Location | Why Keep in DB |
|-------|------------------|----------------|
| Row Level Security (RLS) | ✅ Database | Last line of defense, cannot be bypassed |
| PII masking (`leads_masked` view) | ✅ Database | Data never leaves DB unmasked |
| `reveal_lead_pii()` with rate limit | ✅ Database | Atomic rate limiting, audit logging |
| Audit triggers (INSERT/UPDATE/DELETE) | ⚠️ Partial | Must be DB-level for immutability |
| Role checking (`has_role`, etc.) | ✅ Database | Used by RLS policies |
| Foreign key constraints | ❌ Missing | Add for referential integrity |
| Indexes for performance | ❌ Missing | Add for scalability |

### 2.2 Move to Backend

| Logic | Current Location | Why Move to Backend |
|-------|------------------|---------------------|
| User creation/deletion | Edge function | Keep, but add to backend for consistency |
| Agent deactivation logging | Frontend | Move to backend/DB trigger |
| Suspicious activity detection | Frontend | Move to backend (pattern detection) |
| AI orchestration | N/A (new) | Backend controls Gemini API calls |
| Google Sheets sync | N/A (new) | Backend manages bidirectional sync |
| Email workflows | Edge function | Backend queue with retry logic |
| Rate limiting (global) | Frontend display only | Backend enforces, DB backs up |
| Input validation | Frontend (Zod) | Add backend validation (Zod/Joi) |
| Session/token refresh | Frontend | Backend validates, frontend stores |

### 2.3 Remove/Reduce in Frontend

| Logic | Current Location | Action |
|-------|------------------|--------|
| Direct Supabase queries | Throughout frontend | Route through backend API |
| Violation counter | SecurityShieldProvider | Track in backend/DB |
| Role-based access decisions | useRequireAuth | Keep for UX, backend enforces |
| Activity logging (manual) | Various components | Remove, use DB triggers |
| Screenshot/copy deterrents | Security hooks | Keep as deterrents, accept limits |

---

## 3. Migration Risks & Mitigations

### 3.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Data Loss During Migration** | Medium | Critical | Export Lovable data first, verify row counts |
| **Auth Token Incompatibility** | High | High | Use same Supabase JWT format, test thoroughly |
| **Realtime Subscription Breaks** | High | Medium | Test all subscriptions, add reconnect logic |
| **RLS Policy Differences** | Medium | High | Copy exact policies, run comparison tests |
| **User Session Invalidation** | High | Medium | Plan maintenance window, notify users |
| **Edge Function URL Changes** | High | Low | Update all frontend function calls |
| **Missing Data (FK violations)** | Medium | Medium | Clean up orphaned records before adding FKs |

### 3.2 Detailed Risk Analysis

#### 3.2.1 Data Consistency Risks

**Problem**: Moving from Lovable's Supabase to your own instance means data export/import.

**Risks**:
- Lovable may not provide SQL dump access
- UUIDs might conflict if any are hardcoded
- `auth.users` table is managed by Supabase, cannot export passwords

**Mitigation**:
```
1. Export data via Supabase API (not SQL dump)
2. Create fresh auth.users in new instance
3. Force password reset for all users on first login
4. Map old user IDs to new user IDs if needed
5. Verify row counts: profiles, leads, tasks, activity_logs
```

#### 3.2.2 Auth/Session Handling Risks

**Problem**: Frontend stores Supabase Project URL and anon key.

**Risks**:
- Hard-coded Lovable Supabase URL in frontend
- JWT tokens signed by Lovable instance won't work on new instance
- Session persistence in localStorage will be invalid

**Mitigation**:
```
1. Update .env variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
2. Clear localStorage on first load (version check)
3. Redirect to login on auth failure
4. Test refresh token flow
```

#### 3.2.3 Realtime Updates Risks

**Problem**: Frontend subscribes to Postgres changes for live updates.

**Risks**:
- Realtime publication might not be enabled on new tables
- Channel names might conflict
- Connection limits on new Supabase plan

**Mitigation**:
```sql
-- Enable realtime on required tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
```

#### 3.2.4 User Experience Regression Risks

**Problem**: Phase 1 migration focuses on backend, UI might feel slower.

**Risks**:
- Added backend hop increases latency
- Optimistic updates might conflict with backend validation
- Loading states might not match current UX

**Mitigation**:
```
1. Keep direct Supabase calls for Phase 1 (minimal changes)
2. Migrate to backend incrementally in Phase 2
3. Add loading skeletons where missing
4. Implement optimistic updates with rollback
```

---

## 4. Phased Implementation Roadmap

### Phase 0: Preparation (Before Any Changes)
**Duration**: 1-2 days  
**Goal**: Ensure we can recover if anything goes wrong

| Task | Status | Notes |
|------|--------|-------|
| Export all data from Lovable Supabase | ⬜ | Use API, not SQL dump |
| Document current .env configuration | ⬜ | SUPABASE_URL, keys |
| Create new Supabase project | ⬜ | Choose region near users |
| Test Lovable frontend still works | ⬜ | Baseline for comparison |
| Set up local development environment | ⬜ | Vite + Supabase local |

---

### Phase 1: Database Recreation
**Duration**: 1-2 days  
**Goal**: Self-managed Supabase with identical schema + improvements

| Task | Script | Notes |
|------|--------|-------|
| Create enums | `01_enums.sql` | app_role, lead_status, task_status, task_priority |
| Create tables | `02_tables.sql` | profiles, user_roles, leads, tasks, activity_logs |
| Add foreign keys | `03_foreign_keys.sql` | New: referential integrity |
| Add indexes | `04_indexes.sql` | New: performance optimization |
| Create functions | `05_functions.sql` | has_role, mask_*, reveal_pii, etc. |
| Create views | `06_views.sql` | leads_masked |
| Create triggers | `07_triggers.sql` | updated_at, audit logging |
| Create RLS policies | `08_rls_policies.sql` | All tables protected |
| Add audit triggers | `09_audit_triggers.sql` | New: CRUD logging |
| Enable realtime | `10_realtime.sql` | Publication setup |
| Bootstrap first admin | `11_bootstrap.sql` | Manual: first admin user |

**Security Guarantees After Phase 1**:
- ✅ All data access controlled by RLS
- ✅ PII never exposed unmasked (except via reveal_lead_pii)
- ✅ All data changes audited
- ✅ Rate limiting on PII reveals
- ✅ Referential integrity enforced

---

### Phase 2: Frontend Migration
**Duration**: 1-2 days  
**Goal**: Connect existing Lovable frontend to new Supabase

| Task | File Changes | Notes |
|------|--------------|-------|
| Update Supabase credentials | `.env` | New project URL + anon key |
| Update edge function URLs | `supabase/functions/*` | Deploy to new project |
| Test auth flow | `AuthContext.tsx` | Login, logout, session refresh |
| Test all CRUD operations | All components | Verify RLS works correctly |
| Test realtime subscriptions | Lead/task lists | Verify live updates |
| Test PII masking | `MaskedField.tsx` | Verify mask + reveal |
| Test kill switch | `AgentKillSwitch.tsx` | Verify instant logout |
| Test activity logging | `ActivityDashboard.tsx` | Verify all actions logged |

**Migration Validation Checklist**:
```markdown
- [ ] Admin can login
- [ ] Agent can login
- [ ] Deactivated agent cannot login
- [ ] Admin sees all leads
- [ ] Agent sees only assigned leads
- [ ] PII is masked by default
- [ ] PII reveal works (rate limited)
- [ ] Lead status updates in realtime
- [ ] Kill switch logs out agent immediately
- [ ] Activity dashboard shows all actions
```

---

### Phase 3: Backend Service Introduction
**Duration**: 3-5 days  
**Goal**: Add authoritative backend layer between frontend and database

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │ ──▶ │   Backend   │ ──▶ │  Supabase   │
│  (React)    │     │  (Node.js)  │     │  (Postgres) │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Backend Tech Stack**:
- **Runtime**: Node.js 20+ / Bun
- **Framework**: Express or Hono (lightweight)
- **Validation**: Zod (already used in frontend)
- **Database Client**: Supabase JS SDK (service role)
- **Auth**: Verify Supabase JWT, extract user context
- **Hosting**: Supabase Edge Functions (Phase 3a) → VPS/Cloud Run (Phase 3b)

**API Endpoints**:
```
POST   /api/auth/verify          # Validate JWT, return user context
GET    /api/leads                # List leads (RLS applied via user context)
POST   /api/leads                # Create lead (admin only)
PATCH  /api/leads/:id            # Update lead
DELETE /api/leads/:id            # Delete lead (admin only)
POST   /api/leads/:id/reveal     # Reveal PII (rate limited, logged)
GET    /api/tasks                # List tasks
POST   /api/tasks                # Create task
PATCH  /api/tasks/:id            # Update task
GET    /api/agents               # List agents (admin only)
POST   /api/agents               # Create agent (admin only)
PATCH  /api/agents/:id/status    # Activate/deactivate agent
GET    /api/activity             # Activity logs
GET    /api/health               # Health check
```

**Security at Backend Layer**:
- All requests require valid JWT
- Backend uses service role key (bypasses RLS for admin operations)
- Backend re-implements business rules as additional checks
- Input validation before database writes
- Rate limiting per user (in-memory or Redis)

---

### Phase 4: Google Sheets Integration
**Duration**: 3-5 days  
**Goal**: Bidirectional sync between CRM and Google Sheets

**Architecture**:
```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   Sheets    │ ◀──────▶ │   Backend   │ ◀──────▶ │  Supabase   │
│  (Airtable  │  Sync    │  (Sync Job) │          │  (Source of │
│   -like)    │  Queue   │             │          │   Truth)    │
└─────────────┘          └─────────────┘          └─────────────┘
       │
       ▼
┌─────────────┐
│ Spreadsheet │
│ Flexibility │
│ + Security  │
└─────────────┘
```

**Sync Strategy**:

| Direction | Trigger | Behavior |
|-----------|---------|----------|
| DB → Sheets | Postgres webhook | Push changes to sheet |
| Sheets → DB | Sheets onEdit trigger | Queue change, validate, write to DB |
| Conflict | Timestamp comparison | Newer wins, log conflict |

**Security Considerations**:
- Sheets shows masked PII (same as frontend)
- No reveal capability in Sheets (must use CRM)
- All changes go through backend validation
- Audit log records sync source
- Sheet is NOT source of truth

**PII in Sheets**:
```
Option A: Never show PII in Sheets (safest)
Option B: Show masked PII only (current behavior)
Option C: Separate "PII Sheet" with restricted access (complex)

Recommendation: Option B (masked PII, same as frontend)
```

---

### Phase 5: Gemini AI Integration
**Duration**: 3-5 days  
**Goal**: Background AI processing for insights, no chat UI

**AI Capabilities**:

| Feature | Trigger | Output |
|---------|---------|--------|
| Lead Scoring | New lead created | `leads.ai_score` (1-100) |
| Summary Generation | Lead notes updated | `leads.ai_summary` |
| Conversion Prediction | Daily batch | `leads.ai_conversion_probability` |
| Agent Performance | Weekly batch | `agent_metrics` table |
| Anomaly Detection | Hourly | Alert if unusual patterns |

**Execution Model**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  DB Change  │ ──▶ │   Queue     │ ──▶ │  AI Worker  │
│  (trigger)  │     │  (Redis/BQ) │     │  (Gemini)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Rate Limit  │
                    │ (cost ctrl) │
                    └─────────────┘
```

**Cost Control**:
- Queue AI requests, don't process immediately
- Batch similar requests (summarize 10 leads at once)
- Set daily token budget
- Use Gemini Flash for simple tasks, Pro for complex
- Track usage in `ai_usage_logs` table

**Schema Additions**:
```sql
-- Add AI-generated columns to leads
ALTER TABLE leads ADD COLUMN ai_score integer;
ALTER TABLE leads ADD COLUMN ai_summary text;
ALTER TABLE leads ADD COLUMN ai_conversion_probability numeric(3,2);
ALTER TABLE leads ADD COLUMN ai_processed_at timestamptz;

-- AI usage tracking
CREATE TABLE ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL,
  tokens_used integer NOT NULL,
  cost_cents integer NOT NULL,
  entity_type text,
  entity_id uuid,
  created_at timestamptz DEFAULT now()
);
```

---

### Phase 6: Email & Scheduling
**Duration**: 5-7 days  
**Goal**: Inbound/outbound email workflows, reminders, automation

**Components**:

| Component | Purpose | Technology |
|-----------|---------|------------|
| Outbound Email | Notifications, campaigns | Resend API |
| Inbound Email | Parse replies to leads | Resend webhooks / custom domain |
| Scheduler | Reminders, batch jobs | pg_cron / external cron |
| Drip Campaigns | Automated sequences | Custom state machine |

**Schema Additions**:
```sql
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id),
  template_id uuid REFERENCES email_templates(id),
  status text DEFAULT 'pending',
  scheduled_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  remind_at timestamptz NOT NULL,
  message text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
```

---

## 5. SaaS Evolution Considerations

### 5.1 Multi-Tenant Readiness

**Current State**: Single-tenant (one organization, multiple users)

**Multi-Tenant Options**:

| Strategy | Pros | Cons |
|----------|------|------|
| **Shared Schema + org_id** | Simple, cost-effective | RLS complexity, noisy neighbor |
| **Schema per Tenant** | Isolation, easy backup | Schema migration complexity |
| **Database per Tenant** | Full isolation | Most expensive, connection overhead |

**Recommendation**: Schema + org_id for MVP, migrate to schema-per-tenant if needed.

**Schema Changes for Multi-Tenancy**:
```sql
-- Add organization context
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Add org_id to all tables
ALTER TABLE profiles ADD COLUMN org_id uuid REFERENCES organizations(id);
ALTER TABLE leads ADD COLUMN org_id uuid REFERENCES organizations(id);
ALTER TABLE tasks ADD COLUMN org_id uuid REFERENCES organizations(id);

-- Update RLS to include org_id
CREATE POLICY "Users can only access own org leads"
  ON leads FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE user_id = auth.uid()));
```

### 5.2 Scalability Considerations

| Area | Current Limit | Scaling Strategy |
|------|---------------|------------------|
| Database connections | ~100 (Supabase free) | Connection pooling (PgBouncer) |
| Row count | Millions | Partitioning by created_at |
| Activity logs | Unbounded | Archive to cold storage monthly |
| Realtime subscriptions | ~200 concurrent | Upgrade Supabase plan |
| AI API calls | Rate limited | Queue + batch processing |
| File storage | N/A | Use Supabase Storage when needed |

### 5.3 Observability & Monitoring

**Recommended Stack**:

| Layer | Tool | Purpose |
|-------|------|---------|
| Application Logs | Supabase Logs / Axiom | Request tracing, errors |
| Database Metrics | Supabase Dashboard | Query performance, connections |
| Error Tracking | Sentry | Frontend + backend errors |
| Uptime Monitoring | Better Stack / UptimeRobot | Health checks |
| Business Metrics | Custom dashboard | Leads, conversions, agent activity |

**Key Metrics to Track**:
- [ ] API response times (p50, p95, p99)
- [ ] Database query times
- [ ] PII reveal rate per user
- [ ] Failed login attempts
- [ ] RLS policy violations (if logged)
- [ ] AI token usage and cost
- [ ] Sheets sync lag time

### 5.4 AI Cost & Execution Control

**Cost Control Mechanisms**:

```javascript
// Example: AI request queue with budget control
const AI_DAILY_BUDGET_CENTS = 500; // $5/day

async function processAIQueue() {
  const todayUsage = await db.query(`
    SELECT SUM(cost_cents) as total 
    FROM ai_usage_logs 
    WHERE created_at > now() - interval '1 day'
  `);
  
  if (todayUsage.total >= AI_DAILY_BUDGET_CENTS) {
    console.log('Daily AI budget exceeded, skipping');
    return;
  }
  
  // Process next batch
  const batch = await getNextAIBatch(10);
  await processWithGemini(batch);
}
```

**Execution Strategies**:
- **Immediate**: Lead scoring on create (fast, cheap)
- **Batched**: Summaries every 5 minutes (reduces API calls)
- **Scheduled**: Predictions daily at 2am (off-peak)
- **Manual**: On-demand reports (user-triggered)

---

## 6. Blocking Issues & Technical Debt

### 6.1 Current Blockers for Extensibility

| Issue | Blocks | Fix |
|-------|--------|-----|
| No foreign keys | Data integrity, cascading deletes | Add FK constraints |
| Direct Supabase access | Backend introduction | Route through API |
| Frontend activity logging | Reliable audit trail | Use DB triggers |
| Hard-coded Supabase URLs | Environment switching | Use .env variables |
| Single tenant schema | Multi-org support | Add org_id column |

### 6.2 Hidden Security Debt

| Debt | Risk | Priority |
|------|------|----------|
| Agent can reassign leads | Data access manipulation | 🔴 High |
| No login auditing | Cannot detect brute force | 🟡 Medium |
| Bootstrap secret persists | Admin creation backdoor | 🟡 Medium |
| Rate limit race condition | Reveal limit bypass | 🟡 Medium |
| No IP logging in reveals | Cannot trace leaks | 🟡 Medium |

### 6.3 Limits on Sheets/AI Integration

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Masked view doesn't include ai_* columns | Need to update view | Add columns to leads_masked |
| No webhook support in current schema | Need for Sheets sync | Add webhook_events table |
| activity_logs is polymorphic | Complex querying | Accept, or normalize |
| No batch processing infrastructure | AI queue | Add job queue table |

---

## 7. Assumptions

This plan assumes:

1. **Lovable Data Export**: You can export data via Supabase API (not SQL dump)
2. **New Supabase Instance**: You will create a new Supabase project
3. **Password Reset Required**: All users will need new passwords
4. **Frontend Minimal Changes (Phase 1-2)**: Only .env and edge function URLs change initially
5. **Backend Optional (Phase 3+)**: System works without backend using existing RLS
6. **Google Sheets API Access**: You have access to Google Sheets API
7. **Gemini API Access**: You have access to Gemini API with quota
8. **Email Service**: Resend or similar is available
9. **Single Organization (Initial)**: Multi-tenancy is Phase N (future)
10. **Agents Semi-Adversarial**: Design assumes agents might try to access unauthorized data

---

## 8. Next Steps

### Immediate Actions (Today)

1. ⬜ Create new Supabase project
2. ⬜ Run SQL scripts in order (see `/scripts` directory)
3. ⬜ Create first admin user manually
4. ⬜ Update frontend `.env` with new credentials
5. ⬜ Deploy edge functions to new project
6. ⬜ Test all functionality against checklist

### This Week

1. ⬜ Complete Phase 1 (database) and Phase 2 (frontend migration)
2. ⬜ Verify all security controls work
3. ⬜ Run penetration tests as agent role
4. ⬜ Document any issues found

### Next Sprint

1. ⬜ Design backend API (Phase 3)
2. ⬜ Prototype Sheets sync (Phase 4)
3. ⬜ Evaluate Gemini API for lead scoring (Phase 5)

---

*Document Version: 1.0*  
*Last Updated: 2025-12-31*
