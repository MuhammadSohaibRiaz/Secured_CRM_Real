# Edge Functions Deployment Guide

This guide will help you deploy the three edge functions to your new Supabase project.

## Prerequisites

### 1. Install Supabase CLI

**For Windows (choose one method):**

**Option A: Using Scoop (Recommended)**
```bash
# Install Scoop first if you don't have it
# https://scoop.sh
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Option B: Using Chocolatey**
```bash
choco install supabase
```

**Option C: Direct Download**
1. Download from: https://github.com/supabase/cli/releases
2. Extract `supabase.exe` to a folder in your PATH

**Verify installation:**
```bash
supabase --version
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link your project
```bash
supabase link --project-ref pyuanmeffplevwqkzgzz
```

---

## Step 1: Set Edge Function Secrets

Go to **Supabase Dashboard → Edge Functions → Manage secrets** and add these:

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `ADMIN_BOOTSTRAP_SECRET` | `your-secret-here` | For creating first admin via /bootstrap page |
| `RESEND_API_KEY` | `re_...` | (Optional) For email notifications |
| `ADMIN_NOTIFICATION_EMAIL` | `admin@example.com` | (Optional) Email to receive alerts |

> **Important**: Choose a strong bootstrap secret (e.g., 32 random characters). You'll need this on the `/bootstrap` page.

**Example Bootstrap Secret**: `8k2mP9xQ4vN7sL1wR6hJ3bT5gD0fC2y`

---

## Step 2: Deploy Edge Functions

Run these commands from your project root:

```bash
# Deploy all three functions
supabase functions deploy create-user
supabase functions deploy get-client-ip
supabase functions deploy notify-suspicious-activity
```

Or deploy all at once:
```bash
supabase functions deploy
```

---

## Step 3: Verify Deployment

Check deployment status:
```bash
supabase functions list
```

You should see:
```
┌────────────────────────────────┬────────┬─────────┐
│ NAME                           │ STATUS │ VERSION │
├────────────────────────────────┼────────┼─────────┤
│ create-user                    │ ACTIVE │ 1       │
│ get-client-ip                  │ ACTIVE │ 1       │
│ notify-suspicious-activity     │ ACTIVE │ 1       │
└────────────────────────────────┴────────┴─────────┘
```

---

## Step 4: Create First Admin

Now you can use the `/bootstrap` page in your app!

1. **Start your dev server** (if not running):
   ```bash
   npm run dev
   ```

2. **Navigate to**: `http://localhost:8080/bootstrap`

3. **Fill in the form**:
   - **Bootstrap Secret**: The secret you set in Step 1
   - **Full Name**: Your name
   - **Email**: admin@example.com
   - **Password**: Choose a strong password (min 8 chars)

4. **Click "Create Admin Account"**

5. **Login**: You'll be redirected to `/login` - use your new credentials!

---

## Edge Function Details

### 1. create-user
**URL**: `https://pyuanmeffplevwqkzgzz.supabase.co/functions/v1/create-user`

**Actions**:
- `create` (default): Create new user (admin or agent)
- `edit`: Update agent details
- `delete`: Delete agent
- `reset-password`: Reset agent password

**Bootstrap Mode**:
- If `adminSecret` matches `ADMIN_BOOTSTRAP_SECRET`, creates admin
- Otherwise requires admin authentication

### 2. get-client-ip
**URL**: `https://pyuanmeffplevwqkzgzz.supabase.co/functions/v1/get-client-ip`

**Purpose**: Captures and masks client IP address for logging

**Returns**:
```json
{
  "ip": "192.168.xxx.xxx",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### 3. notify-suspicious-activity
**URL**: `https://pyuanmeffplevwqkzgzz.supabase.co/functions/v1/notify-suspicious-activity`

**Purpose**: Sends email alerts for suspicious security events

**Requires**: `RESEND_API_KEY` and `ADMIN_NOTIFICATION_EMAIL` secrets

---

## Troubleshooting

### "Error: Project not linked"
```bash
supabase link --project-ref pyuanmeffplevwqkzgzz
```

### "Function failed to deploy"
Check function logs:
```bash
supabase functions logs create-user
```

### "Bootstrap secret invalid"
Verify the secret in **Supabase Dashboard → Edge Functions → Secrets**

### "Cannot invoke function"
Ensure your `.env` has the correct Supabase URL:
```
VITE_SUPABASE_URL="https://pyuanmeffplevwqkzgzz.supabase.co"
```

---

## Security Notes

- ⚠️ **Delete the bootstrap secret** after creating the first admin (or set it to something random)
- ⚠️ The `/bootstrap` route is publicly accessible - disable it in production
- ✅ All other operations require admin authentication
- ✅ Edge functions use service role key (server-side only)

---

## Quick Command Reference

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy create-user

# View logs (real-time)
supabase functions logs create-user --follow

# List all functions
supabase functions list

# Delete a function
supabase functions delete function-name
```

---

*Last updated: 2025-12-31*
