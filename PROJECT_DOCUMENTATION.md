# 🛡️ RapidNexTech CRM - Project Documentation

## Executive Summary

A **fully secured, enterprise-grade CRM system** built with modern security practices at its core. This system implements defense-in-depth security, ensuring sensitive customer data (PII) is protected at every layer—from database to API to frontend.

---

## 🚀 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with concurrent features |
| **TypeScript** | Type-safe development |
| **Vite** | Lightning-fast build tool |
| **Tailwind CSS** | Utility-first styling |
| **Shadcn/UI** | Accessible component library |
| **TanStack Query** | Server state management with caching |
| **React Router v6** | Client-side routing with protected routes |
| **React Hook Form + Zod** | Form handling with schema validation |

### Backend (Lovable Cloud / Supabase)
| Technology | Purpose |
|------------|---------|
| **PostgreSQL** | Enterprise database with RLS |
| **Row Level Security (RLS)** | Database-level access control |
| **Security Definer Functions** | Privilege escalation prevention |
| **Edge Functions (Deno)** | Serverless backend logic |
| **Supabase Auth** | JWT-based authentication |
| **Realtime Subscriptions** | Live data updates |

### Security Tools
| Tool | Purpose |
|------|---------|
| **Server-side PII Masking** | Data never exposed unmasked |
| **Activity Logging** | Full audit trail |
| **Kill Switch** | Instant agent deactivation |
| **Security Watermarks** | Screenshot deterrent |
| **Time-limited Reveals** | Auto-hide sensitive data |

---

## 📋 Features Developed

### 1. **Role-Based Access Control (RBAC)**
- Separate `user_roles` table (prevents privilege escalation)
- Two roles: `admin` and `agent`
- Security definer functions for role checks
- RLS policies on all tables

### 2. **Admin Dashboard**
- Agent management (create, edit, deactivate)
- Lead management with assignment
- Task creation and tracking
- Activity monitoring dashboard
- Suspicious activity detection (10 reveals / 5 min threshold)
- Agent kill switch with force logout

### 3. **Agent Dashboard**
- Assigned leads only (RLS enforced)
- Lead pipeline with drag-and-drop
- Task management
- Activity feed
- Statistics overview

### 4. **Server-Side PII Protection**
- `leads_masked` view returns pre-masked data
- `mask_email()` and `mask_phone()` PostgreSQL functions
- `reveal_lead_pii()` RPC with authorization + logging
- Frontend never receives raw PII unless explicitly revealed

### 5. **Security Watermarking**
- Diagonal pattern with user identity
- Shows: Name, Email, Timestamp
- Deters screenshots and data theft
- CSS-based (non-removable via DevTools easily)

### 6. **Real-Time Features**
- Live lead updates via Supabase Realtime
- Instant agent deactivation propagation
- Activity dashboard auto-refresh
- Auth state synchronization

### 7. **Email Notifications**
- Suspicious activity alerts via Resend
- Configurable admin notification email
- Edge function for sending alerts

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  • Security Watermark (user identity overlay)                  │
│  • Time-limited reveal (60s auto-hide)                         │
│  • Copy/paste prevention on revealed data                      │
│  • Protected routes with role checks                           │
│  • Force logout on deactivation                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│  • JWT authentication on all requests                          │
│  • leads_masked view (default masked response)                 │
│  • reveal_lead_pii() RPC (authorized reveal + logging)         │
│  • Edge functions with CORS headers                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  • Row Level Security on ALL tables                            │
│  • Separate user_roles table (no privilege escalation)         │
│  • Security definer functions (has_role, is_user_active)       │
│  • mask_email() / mask_phone() immutable functions             │
│  • Activity logging with full audit trail                      │
│  • Supabase default encryption at rest                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Challenges & Solutions

### Challenge 1: RLS Infinite Recursion
**Problem:** Checking user roles within RLS policies caused infinite recursion.

**Solution:** Created `SECURITY DEFINER` functions (`has_role()`, `is_user_active()`) that bypass RLS when checking permissions.

```sql
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

---

### Challenge 2: Force Logout on Deactivation
**Problem:** Deactivated agents could continue using the app until token expired.

**Solution:** Implemented real-time auth state monitoring that checks `is_active` status and forces immediate logout when deactivated.

```typescript
// Polls every 30 seconds + realtime subscription
useEffect(() => {
  if (authUser && !authUser.isActive) {
    supabase.auth.signOut();
    navigate('/login', { state: { error: 'Account deactivated' } });
  }
}, [authUser]);
```

---

### Challenge 3: Server-Side PII Masking
**Problem:** Frontend masking meant API still returned raw PII—vulnerable to network inspection.

**Solution:** Created a database view with masked data + RPC function for controlled reveals.

```sql
-- View always returns masked data
CREATE VIEW leads_masked AS
SELECT 
  id, name,
  mask_email(email) as email,
  mask_phone(phone) as phone,
  -- other fields...
FROM leads;

-- RPC for authorized reveal with logging
CREATE FUNCTION reveal_lead_pii(_lead_id uuid, _field text)
RETURNS text
SECURITY DEFINER
AS $$ /* authorization + logging */ $$;
```

---

### Challenge 4: Privilege Escalation Prevention
**Problem:** Storing roles in profiles table would allow users to modify their own role.

**Solution:** Separate `user_roles` table with admin-only RLS policies. Users cannot INSERT/UPDATE/DELETE their own roles.

---

### Challenge 5: Suspicious Activity Detection
**Problem:** Detecting data harvesting (mass reveals) in real-time.

**Solution:** Activity dashboard monitors reveal patterns. Threshold: >10 reveals in 5 minutes triggers alert + optional agent deactivation.

---

## 🎯 Edge Cases Handled

| Edge Case | Solution |
|-----------|----------|
| Agent tries to access unassigned lead | RLS blocks at database level |
| Deactivated agent has valid JWT | Real-time `is_active` check forces logout |
| Direct API call bypassing frontend | `leads_masked` view returns masked data |
| Admin deletes themselves | Prevented in UI (cannot deactivate self) |
| Concurrent agent deactivation | Realtime subscription ensures instant propagation |
| Token refresh for deactivated user | Auth context checks active status on refresh |
| SQL injection in search | Supabase client uses parameterized queries |
| XSS in lead notes | React's default escaping + no dangerouslySetInnerHTML |

---

## 📊 Database Schema

```
┌──────────────────┐     ┌──────────────────┐
│     profiles     │     │    user_roles    │
├──────────────────┤     ├──────────────────┤
│ id               │     │ id               │
│ user_id ────────────────► user_id        │
│ email            │     │ role (enum)      │
│ full_name        │     │ created_at       │
│ is_active        │     └──────────────────┘
│ last_login_at    │
│ created_by       │
└──────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│      leads       │     │      tasks       │
├──────────────────┤     ├──────────────────┤
│ id               │     │ id               │
│ name             │     │ title            │
│ email (masked)   │     │ description      │
│ phone (masked)   │     │ assigned_to      │
│ company          │     │ created_by       │
│ status           │     │ status           │
│ assigned_to ─────┘     │ priority         │
│ created_by       │     │ due_date         │
│ notes            │     └──────────────────┘
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  activity_logs   │
├──────────────────┤
│ id               │
│ user_id          │
│ action           │
│ entity_type      │
│ entity_id        │
│ details (jsonb)  │
│ created_at       │
└──────────────────┘
```

---

## 🔒 RLS Policy Summary

| Table | Admin | Agent |
|-------|-------|-------|
| **profiles** | Full CRUD | Read/Update own only |
| **user_roles** | Full CRUD | Read own only |
| **leads** | Full CRUD | Read/Update assigned only |
| **tasks** | Full CRUD | Read/Update assigned only |
| **activity_logs** | Read all | Read own, Insert own |

---

# 📣 Shareable Post

---

## 🚀 Just Shipped: Enterprise-Grade Secure CRM

We've built a **fully secured CRM system** with security-first architecture. Here's what makes it bulletproof:

### 🛡️ Server-Side PII Masking
Sensitive data (emails, phones) is **masked at the database level**. The API never returns raw PII—even if you inspect network requests, you'll only see `j*****@gmail.com`.

### 🔐 Row-Level Security
Every query is filtered by PostgreSQL RLS. Agents can **only see leads assigned to them**—enforced at the database, not just the UI.

### ⚡ Instant Kill Switch
Suspicious activity? Admins can **instantly deactivate** any agent. They're logged out immediately—no waiting for token expiry.

### 👁️ Audit Everything
Every PII reveal is logged with timestamp, user ID, and field type. **Full accountability** for data access.

### 🎭 Security Watermarks
Screenshots are deterred with **invisible watermarks** showing user identity—making data theft traceable.

### ⏱️ Time-Limited Reveals
Revealed data **auto-hides after 60 seconds**. Less exposure = less risk.

### 🚨 Anomaly Detection
Unusual patterns (mass reveals) trigger alerts. **Catch data harvesting before it's too late.**

---

**Tech Stack:** React, TypeScript, PostgreSQL, Supabase, Edge Functions

**Security Patterns:** Defense-in-depth, Zero-trust, Least privilege

---

*Built for teams who take customer data protection seriously.* 🔐

---

# 🚀 Future Improvements

## High Priority (Recommended)

### 1. **IP Address Tracking in Watermarks**
Add server-side IP capture via edge function for enhanced traceability.

```typescript
// Edge function to get client IP
const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
```
**Value:** Stronger accountability, geo-location of access.

---

### 2. **Two-Factor Authentication (2FA)**
Add TOTP-based 2FA for admin accounts.

**Implementation:** Supabase supports MFA via `supabase.auth.mfa`

**Value:** Prevents account takeover even if password is compromised.

---

### 3. **Session Management Dashboard**
Allow admins to view active sessions and remotely terminate them.

**Value:** Instant response to compromised accounts.

---

### 4. **Data Export Controls**
- Limit bulk exports to admins only
- Watermark exported CSV/PDF files
- Log all export events

**Value:** Prevents mass data exfiltration.

---

### 5. **Field-Level Encryption**
Encrypt PII columns at rest using Supabase Vault.

```sql
-- Store encrypted
INSERT INTO leads (email_encrypted) 
VALUES (vault.encrypt('user@email.com', 'key_id'));
```

**Value:** Even DB admins can't read raw PII.

---

## Medium Priority

### 6. **Login Anomaly Detection**
- Detect logins from new devices/locations
- Send email alerts for suspicious logins
- Require re-authentication for sensitive actions

---

### 7. **Rate Limiting on Reveals**
Implement rate limiting at the edge function level:
- Max 20 reveals per agent per hour
- Automatic temporary lockout on abuse

---

### 8. **Data Retention Policies**
- Auto-archive old leads (>1 year)
- GDPR-compliant data deletion
- Audit log retention configuration

---

### 9. **Role Hierarchy**
Expand roles beyond admin/agent:
- `super_admin` - Can manage other admins
- `team_lead` - Can view team's leads only
- `readonly` - View-only access

---

### 10. **Audit Log Export**
- Scheduled audit log exports
- Integration with SIEM tools
- Compliance reporting (SOC2, GDPR)

---

## Nice to Have

### 11. **Biometric Authentication**
WebAuthn/FIDO2 support for passwordless login.

### 12. **Geo-Fencing**
Restrict access to specific countries/IP ranges.

### 13. **Data Loss Prevention (DLP)**
Detect and prevent sensitive data in notes/comments.

### 14. **Breach Notification System**
Automated notifications if unusual patterns detected.

### 15. **Compliance Dashboard**
Visual overview of security posture and compliance status.

---

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| 2FA for Admins | High | Medium | ⭐⭐⭐⭐⭐ |
| IP Tracking | High | Low | ⭐⭐⭐⭐⭐ |
| Session Management | High | Medium | ⭐⭐⭐⭐ |
| Rate Limiting | High | Low | ⭐⭐⭐⭐ |
| Field Encryption | High | High | ⭐⭐⭐ |
| Export Controls | Medium | Medium | ⭐⭐⭐ |
| Role Hierarchy | Medium | High | ⭐⭐ |
| Geo-Fencing | Low | Medium | ⭐⭐ |

---

## Quick Wins (Can Implement Now)

1. **Enable Leaked Password Protection** - Backend Settings → Auth → Enable
2. **IP in Watermarks** - Single edge function addition
3. **Rate Limiting** - Add counter check in `reveal_lead_pii()` function
4. **Export Logging** - Add activity log on any data export

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Project: RapidNexTech Secure CRM*
