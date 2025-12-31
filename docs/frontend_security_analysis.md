# Frontend Security Analysis: SecuredLead CRM

> **Document Type**: Security Architecture Analysis  
> **Date**: 2025-12-31  
> **Scope**: Client-side security mechanisms, role-based flows, data handling, and trust boundaries

---

## 1. Role-Based Flows

### 1.1 Admin Role (`/admin`)

| Action | Component | Backend Dependency | Logging |
|--------|-----------|-------------------|---------|
| View all agents | `AgentList.tsx` | `user_roles` + `profiles` tables | No |
| Create agent | `CreateAgentDialog.tsx` | `create-user` edge function | No explicit log |
| Edit agent | `EditAgentDialog.tsx` | `create-user` edge function (action: 'edit') | No explicit log |
| Delete agent | `AgentList.tsx` → edge function | `create-user` edge function (action: 'delete') | No explicit log |
| Reset password | `ResetPasswordDialog.tsx` | `create-user` edge function (action: 'reset-password') | No explicit log |
| Kill switch (disable) | `AgentKillSwitch.tsx` | `profiles.is_active` update | ✅ `activity_logs` |
| View all leads | `LeadList.tsx` | `leads_masked` view | No |
| Create lead | `CreateLeadDialog.tsx` | `leads` table INSERT | No explicit log |
| Assign lead | `AssignLeadDialog.tsx` | `leads` table UPDATE | No explicit log |
| View lead details | `LeadDetailsDialog.tsx` | `leads_masked` + `reveal_lead_pii` RPC | ✅ Reveal logged |
| View all tasks | `AdminTaskList.tsx` | `tasks` table | No |
| Create task | `CreateTaskDialog.tsx` | `tasks` table INSERT | No explicit log |
| View activity | `ActivityDashboard.tsx` | `activity_logs` table | N/A (reading) |
| Send suspicious alert | `ActivityDashboard.tsx` | `notify-suspicious-activity` edge function | No |

### 1.2 Agent Role (`/agent`)

| Action | Component | Backend Dependency | Logging |
|--------|-----------|-------------------|---------|
| View assigned leads | `AgentLeadList.tsx` | `leads_masked` view (RLS-filtered) | No |
| Update lead status | `AgentLeadList.tsx` | `leads` table UPDATE | ✅ `activity_logs` |
| Update lead notes | `AgentLeadList.tsx` | `leads` table UPDATE | ✅ `activity_logs` |
| Reveal PII | `MaskedField.tsx` | `reveal_lead_pii()` RPC | ✅ Server-side logged |
| View pipeline | `LeadPipeline.tsx` | `leads` table (RLS-filtered) | No |
| Drag-drop status change | `LeadPipeline.tsx` | `leads` table UPDATE | No explicit log |
| View own tasks | `TaskList.tsx` | `tasks` table (RLS-filtered) | No |
| Update task status | `TaskList.tsx` | `tasks` table UPDATE | No explicit log |
| View own activity | `ActivityFeed.tsx` | `activity_logs` table (RLS-filtered) | N/A (reading) |

### 1.3 Route Protection Flow

```
User Visits Route
       ↓
useRequireAuth('admin'|'agent')
       ↓
┌─────────────────┐
│ Check: isLoading │
└─────────────────┘
       ↓
┌─────────────────┐
│ Check: user null │ → Navigate to /login
└─────────────────┘
       ↓
┌─────────────────────┐
│ Check: !authUser.isActive │ → Navigate to /login with error
└─────────────────────┘
       ↓
┌─────────────────────────┐
│ Check: role mismatch    │ → Navigate to /unauthorized
└─────────────────────────┘
       ↓
✅ Render Protected Page
```

---

## 2. Data Fetch & Display Patterns

### 2.1 PII Masking Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      FRONTEND FLOW                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AgentLeadList.tsx / LeadList.tsx                                │
│          ↓                                                       │
│  supabase.from('leads_masked')  ←── Uses masked VIEW             │
│          ↓                                                       │
│  Receives: { email: 'j*****@gmail.com', phone: '****1234' }      │
│          ↓                                                       │
│  <MaskedField value={lead.email} type="email" entityId={lead.id}>│
│          ↓                                                       │
│  User clicks Eye icon                                            │
│          ↓                                                       │
│  supabase.rpc('reveal_lead_pii', { _lead_id, _field })           │
│          ↓                                                       │
│  Server checks: auth + role + assignment + rate limit            │
│          ↓                                                       │
│  Returns raw value OR throws rate limit error                    │
│          ↓                                                       │
│  Frontend shows revealed value for 60 seconds (auto-hide)        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Sources by Role

| Component | Data Source | Why |
|-----------|-------------|-----|
| Admin → LeadList | `leads_masked` view | PII pre-masked at DB level |
| Agent → AgentLeadList | `leads_masked` view | PII pre-masked + RLS filters |
| Agent → LeadPipeline | `leads` table directly | **⚠️ RISK: exposes raw PII if RLS fails** |
| Admin → AgentList | `profiles` + `user_roles` | Direct table access |
| All → ActivityDashboard | `activity_logs` | RLS filters by role |

> **⚠️ Inconsistency**: `LeadPipeline.tsx` fetches from `leads` table directly (line 309), not the `leads_masked` view. This means if RLS policies fail or are bypassed, raw PII would be exposed. However, the component uses `<MaskedField>` which displays the server-masked value anyway.

---

## 3. Client-Side Security Mechanisms

### 3.1 Complete Mechanism Inventory

| Mechanism | File | What It Does | Bypassable? | Server Backup? |
|-----------|------|--------------|-------------|----------------|
| **Screenshot Detection** | `useScreenshotProtection.ts` | Detects PrintScreen, Cmd+Shift+3/4/5, Ctrl+Shift+S | ✅ Yes (external tools) | ❌ None |
| **Copy Protection** | `useCopyProtection.ts` | Blocks Ctrl+C/X/A, right-click, disables text selection | ✅ Yes (DevTools) | ❌ None |
| **Focus/Blur Detection** | `useFocusProtection.ts` | Detects tab switch, window blur, DevTools resize | ✅ Yes (mobile, external monitors) | ❌ None |
| **DevTools Detection** | `useFocusProtection.ts` | Checks `outerWidth - innerWidth > 160` | ✅ Yes (docked, undocked tools) | ❌ None |
| **Security Watermark** | `security-watermark.tsx` | Overlays user name, email, timestamp, IP | ✅ Yes (CSS removal, crop) | ❌ None |
| **Blur Overlay** | `SecurityBlurOverlay.tsx` | Covers screen when violation detected | ✅ Yes (refresh page) | ❌ None |
| **Violation Tracking** | `SecurityShieldProvider.tsx` | 5 violations → forced logout | ✅ Yes (refresh resets) | ❌ None |
| **Auto-Hide Revealed Data** | `masked-field.tsx` | 60-second timer hides data | ✅ Yes (screenshot in 60s) | ❌ None |
| **Copy Prevention on PII** | `masked-field.tsx` | `onCopy`, `onCut`, `onContextMenu` blocked | ✅ Yes (DevTools) | ❌ None |
| **Rate Limit UI Feedback** | `masked-field.tsx` | Disables button when rate limited | ✅ Yes (direct API call) | ✅ Server enforces |

### 3.2 Detailed Mechanism Analysis

#### Screenshot Protection (`useScreenshotProtection.ts`)
```typescript
// Detected keys:
- PrintScreen (any modifier)
- Alt+PrintScreen
- Ctrl+Shift+S (Windows Snipping Tool)
- Cmd+Shift+3/4/5 (macOS screenshots)

// Limitations:
- Cannot detect third-party screenshot tools (Snagit, ShareX, etc.)
- Cannot detect phone camera pointed at screen
- Cannot detect screen recording software
- Cannot block OS-level screenshot on most systems
```

#### Focus Protection (`useFocusProtection.ts`)
```typescript
// Detection methods:
1. document.visibilitychange → tab switch
2. window.blur → window loses focus
3. (outerWidth - innerWidth > 160) → DevTools opened

// Limitations:
- 500ms grace period can be exploited
- DevTools detection via resize is unreliable:
  • Can be docked to any side
  • Can be undocked (separate window)
  • Threshold (160px) is arbitrary
- Does not detect mobile debugging
- Does not detect browser extensions
```

#### Copy Protection (`useCopyProtection.ts`)
```typescript
// Protection methods:
1. Keyboard: Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+V blocked outside inputs
2. Context menu: right-click blocked outside inputs
3. CSS: user-select: none on body

// Limitations:
- DevTools console: copy($0.innerText)
- Browser reader mode extracts text
- Screen OCR tools
- Network tab shows raw API responses
```

### 3.3 The "Deterrent Model"

All client-side protections follow this model:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DETERRENT vs ENFORCEMENT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLIENT-SIDE (Deterrent Only):                                  │
│  ├── Screenshot detection → Logs attempt, shows warning        │
│  ├── Copy protection → Blocks casual copy, logs attempt        │
│  ├── Focus loss → Blurs screen until focus returns             │
│  ├── Watermark → Identifies user if screenshot shared          │
│  └── Auto-hide → Reduces exposure window                       │
│                                                                 │
│  These CANNOT PREVENT a determined attacker.                    │
│  They increase friction and create an audit trail.             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SERVER-SIDE (Enforcement):                                     │
│  ├── RLS → Data never fetched if not authorized                │
│  ├── leads_masked view → PII never in API response             │
│  ├── reveal_lead_pii() → Rate limit + auth + logging           │
│  ├── is_user_active check → Blocks disabled users              │
│  └── activity_logs → Immutable audit trail                     │
│                                                                 │
│  These ARE the real security layer.                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Masked vs Revealed Data Handling

### 4.1 MaskedField Component Flow

```typescript
// File: masked-field.tsx

// Initial state:
isRevealed = false
revealedValue = null



// Display logic:
{isRevealed && revealedValue ? revealedValue : value}
// Where `value` is already pre-masked from leads_masked view

// Reveal flow:
onClick → supabase.rpc('reveal_lead_pii', { _lead_id, _field })
        → Server validates: auth, role, assignment, rate limit
        → Returns raw value OR throws error
        → Frontend stores in revealedValue
        → Starts 60-second auto-hide timer

// Auto-hide:
setTimeout(() => {
  setIsRevealed(false);
  setRevealedValue(null);
}, 60000);

// Rate limit handling:
if (error.message.includes('Rate limit exceeded')) {
  setRateLimited(true);
  // Button disabled, toast shown
}
```

### 4.2 Reveal Rate Limiting

| Layer | Enforcement | Limit |
|-------|-------------|-------|
| Server (`reveal_lead_pii`) | Hard limit | 20/hour |
| Client (`masked-field.tsx`) | Soft disable | Reflects server error |

> **Note**: The client-side rate limit display is purely cosmetic. The real enforcement happens in the PostgreSQL function which counts `activity_logs` entries within the time window.

---

## 5. Action Logging & Triggers

### 5.1 Logged Actions

| Action | Where Logged | Logger Location |
|--------|--------------|-----------------|
| Agent disabled/enabled | `activity_logs` | `AgentKillSwitch.tsx` |
| Lead status updated | `activity_logs` | `AgentLeadList.tsx` |
| Lead notes updated | `activity_logs` | `AgentLeadList.tsx`, `LeadDetailsDialog.tsx` |
| PII revealed | `activity_logs` | `reveal_lead_pii()` PostgreSQL function |
| Screenshot attempt | `activity_logs` | `SecurityShieldProvider.tsx` |
| Copy attempt | `activity_logs` | `SecurityShieldProvider.tsx` |
| Tab switch/focus lost | `activity_logs` | `SecurityShieldProvider.tsx` |
| DevTools opened | `activity_logs` | `SecurityShieldProvider.tsx` |
| IP address queried | `activity_logs` | `get-client-ip` edge function |

### 5.2 Missing Logs (Gaps)

| Action | Currently Logged? | Risk |
|--------|-------------------|------|
| Lead created | ❌ No | Cannot audit who created malicious leads |
| Lead deleted | ❌ No | Cannot trace data destruction |
| Lead assigned/reassigned | ❌ No | Cannot trace access pattern changes |
| Agent created | ❌ No | Cannot audit administrative actions |
| Agent deleted | ❌ No | Cannot trace user removal |
| Password reset | ❌ No | Cannot audit credential changes |
| Login success | ❌ No | No session tracking |
| Login failure | ❌ No | Cannot detect brute force |
| Task created/updated | ❌ No | No task audit trail |
| Lead pipeline drag-drop | ❌ No | Status changes untracked in pipeline view |

---

## 6. Behavioral Map

### 6.1 When Agent Attempts Action X

| Agent Action | Frontend Behavior | Backend Enforcement | Outcome if Unauthorized |
|--------------|-------------------|---------------------|-------------------------|
| Access `/admin` | `useRequireAuth('admin')` redirects | N/A (route not fetched) | Redirect to `/unauthorized` |
| View unassigned lead | Component displays empty list | RLS: `assigned_to = auth.uid()` | Lead not in response |
| Update unassigned lead | Supabase update call | RLS blocks UPDATE | Error toast, no change |
| Reveal PII on unassigned lead | `reveal_lead_pii` called | Function checks `assigned_to` | Exception thrown |
| Exceed 20 reveals/hour | Button disabled after server error | `reveal_lead_pii` rate limit | Clear error message |
| Take screenshot | Blur overlay + warning | Nothing | Logged, but data visible |
| Open DevTools | Blur overlay (if detected) | Nothing | Logged if detected |
| Copy revealed data | Event blocked | Nothing | Logged, but data in memory |
| Deactivated mid-session | Realtime subscription triggers logout | `is_user_active` check | Forced logout within 30s |

### 6.2 When Admin Attempts Action X

| Admin Action | Frontend Behavior | Backend Enforcement | Outcome if Error |
|--------------|-------------------|---------------------|------------------|
| Create agent | Dialog → edge function call | Edge function verifies admin role | Error toast |
| Delete agent | Confirmation → edge function | Edge function checks role + prevents self-delete | Error toast |
| Delete self | Button exists | Edge function: `userId === adminId` check | Error 400 |
| Kill switch | Confirmation → profile update | RLS allows admin UPDATE | Agent logged out instantly |
| View all leads | Fetches from `leads_masked` | RLS allows admin SELECT | All leads displayed |
| Create admin via UI | Not possible | Edge function: `role === 'admin' && !isBootstrap` | Error 403 |

---

## 7. Frontend Assumptions About Backend

### 7.1 Critical Assumptions

| Assumption | Frontend Behavior | What Happens if Wrong |
|------------|-------------------|----------------------|
| RLS enforces role separation | Fetches directly, expects filtered results | **Data leak**: Agent sees all leads |
| `leads_masked` always masks PII | Displays value directly as "masked" | **PII exposed**: Raw email/phone in UI |
| `reveal_lead_pii` logs every call | No client-side logging of reveals | **Audit gap**: Reveals not tracked |
| `reveal_lead_pii` enforces rate limit | Relies on error message to disable button | **Harvesting**: Unlimited reveals |
| Realtime subscription propagates `is_active` | Listens for profile changes | **Zombie session**: Disabled user stays logged in |
| Edge functions verify admin role | Calls directly without client-side role check | **Privilege escalation**: Agent creates users |
| `auth.uid()` in RLS is reliable | No JWT validation in frontend | **IDOR**: User spoofs another user's ID |

### 7.2 Implicit Trust

The frontend implicitly trusts that:

1. **Supabase client JWT cannot be forged** — relies on Supabase auth security
2. **RLS policies are correctly implemented** — no policy has `USING (true)` by mistake
3. **Security definer functions work correctly** — `has_role()` doesn't have bugs
4. **Realtime subscriptions are reliable** — kill switch propagates < 30 seconds
5. **Rate limiting is atomic** — no race condition in `reveal_lead_pii` count

---

## 8. Security-Sensitive Flows

### 8.1 High-Risk Flows

| Flow | Risk | Current Mitigation | Recommendation |
|------|------|-------------------|----------------|
| **PII Reveal** | Agent harvests data over time | 20/hour rate limit, 60s auto-hide | ✅ Adequate; consider per-lead limits |
| **Agent Deactivation** | Disabled agent continues accessing | Realtime + 30s polling | ✅ Adequate |
| **Lead Assignment** | Agent reassigns to themselves | RLS prevents agent UPDATE of `assigned_to` | ✅ Adequate |
| **Password Reset** | Admin resets password maliciously | Edge function logs action | ⚠️ Add audit log |
| **User Creation** | Privilege escalation | Edge function verifies admin + bootstrap mode | ✅ Adequate |
| **Activity Log Tampering** | Cover tracks | RLS: no UPDATE/DELETE on `activity_logs` | ✅ Adequate |

### 8.2 Client-Side Only Protections (No Server Backup)

| Control | Risk If Bypassed | Server Mitigation Needed |
|---------|------------------|--------------------------|
| Violation counter (5 = logout) | Refresh resets counter | Add server-side violation counter |
| Screenshot detection | Undetected screenshots | None possible (physical layer) |
| DevTools detection | Network inspection of raw responses | Ensure all responses use masked view |
| Copy prevention | Data copied via DevTools | Consider response tokenization |
| Focus blur | Data visible before blur (500ms) | Reduce grace period or remove |

---

## 9. Logic That Should NOT Live in Frontend

### 9.1 Current Violations

| Logic | Current Location | Why It's Wrong | Recommendation |
|-------|------------------|----------------|----------------|
| Violation reset timeout | `SecurityShieldProvider.tsx` | Refresh resets counter | Track in `activity_logs`, compute server-side |
| Rate limit remaining count | `masked-field.tsx` (display only) | Could mislead user | Already server-enforced ✅ |
| Role-based routing | `useRequireAuth.ts` | UX only, not security | Already RLS-backed ✅ |
| Auto-hide timer | `masked-field.tsx` | Extends exposure if JS blocked | Consider server-side session token for revealed data |

### 9.2 Recommendations

1. **Move violation tracking to server**:
   ```sql
   -- Add to activity_logs queries
   SELECT COUNT(*) FROM activity_logs 
   WHERE user_id = auth.uid() 
   AND action IN ('screenshot_attempt', 'copy_attempt_blocked', 'dev_tools_opened')
   AND created_at > now() - interval '30 minutes';
   -- If count > X, set is_active = false
   ```

2. **Add server-side session expiry for revealed data**:
   - Instead of 60-second client timer, return a short-lived token
   - Token expires server-side, frontend must re-request

3. **Log all CRUD operations**:
   - Add database triggers for INSERT/UPDATE/DELETE on `leads`, `tasks`, `profiles`
   - Remove dependency on frontend logging

---

## 10. Summary Table

| Security Layer | Implementation Status | Enforcement Level |
|----------------|----------------------|-------------------|
| Role-based routing | ✅ Complete | Client-side (UX) |
| RLS policies | ✅ Complete | Server-side ✅ |
| PII masking | ✅ Complete | Server-side ✅ |
| Rate limiting reveals | ✅ Complete | Server-side ✅ |
| Kill switch propagation | ✅ Complete | Server-side ✅ |
| Screenshot deterrent | ✅ Complete | Client-side only |
| Copy deterrent | ✅ Complete | Client-side only |
| Focus blur | ✅ Complete | Client-side only |
| Watermarking | ✅ Complete | Client-side only |
| Violation tracking | ⚠️ Partial | Client-side only |
| CRUD logging | ⚠️ Partial | Mixed (gaps) |
| Login tracking | ❌ Missing | Not implemented |

---

*Document generated by comprehensive frontend security analysis.*
