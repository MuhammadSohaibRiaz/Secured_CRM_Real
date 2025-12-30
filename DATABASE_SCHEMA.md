# Complete Database Schema Documentation

> **Purpose**: This document contains the complete database schema for the Lead Management CRM system. It can be used to recreate the exact database structure in a new Supabase project.

---

## Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Enums](#enums)
4. [Tables](#tables)
5. [Views](#views)
6. [Functions](#functions)
7. [Triggers](#triggers)
8. [Row Level Security (RLS) Policies](#row-level-security-rls-policies)
9. [Complete Migration Script](#complete-migration-script)

---

## Overview

This is a **Lead Management CRM** with the following core features:
- **Role-based access control** (Admin, Agent)
- **Lead pipeline management** with status tracking
- **Task assignment and tracking**
- **Activity logging** for audit trails
- **PII masking** for sensitive data (email, phone)
- **Real-time updates** via Supabase channels

### Key Design Principles:
- Roles stored in separate `user_roles` table (security best practice)
- PII fields masked via database view (`leads_masked`)
- All tables have RLS enabled with restrictive policies
- Security definer functions for role checks to avoid RLS recursion

---

## Entity Relationship Diagram

```
┌─────────────────┐
│   auth.users    │ (Supabase managed)
│─────────────────│
│ id (uuid) PK    │
│ email           │
│ ...             │
└────────┬────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐       ┌─────────────────┐
│    profiles     │       │   user_roles    │
│─────────────────│       │─────────────────│
│ id (uuid) PK    │       │ id (uuid) PK    │
│ user_id FK ─────┼───────│ user_id FK      │
│ full_name       │       │ role (app_role) │
│ email           │       │ created_at      │
│ is_active       │       └─────────────────┘
│ created_by      │
│ last_login_at   │
│ created_at      │
│ updated_at      │
└─────────────────┘
         │
         │ created_by / assigned_to
         ▼
┌─────────────────┐       ┌─────────────────┐
│     leads       │       │     tasks       │
│─────────────────│       │─────────────────│
│ id (uuid) PK    │       │ id (uuid) PK    │
│ name            │       │ title           │
│ email           │       │ description     │
│ phone           │       │ status          │
│ company         │       │ priority        │
│ source          │       │ assigned_to     │
│ notes           │       │ created_by      │
│ status          │       │ due_date        │
│ assigned_to     │       │ completed_at    │
│ created_by      │       │ created_at      │
│ created_at      │       │ updated_at      │
│ updated_at      │       └─────────────────┘
└─────────────────┘
         │
         │ entity_id reference
         ▼
┌─────────────────┐
│  activity_logs  │
│─────────────────│
│ id (uuid) PK    │
│ user_id         │
│ entity_type     │
│ entity_id       │
│ action          │
│ details (jsonb) │
│ created_at      │
└─────────────────┘

┌─────────────────┐
│  leads_masked   │ (VIEW - masks email/phone)
│─────────────────│
│ All lead columns│
│ with masked PII │
└─────────────────┘
```

---

## Enums

```sql
-- Application roles for access control
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');

-- Lead pipeline statuses
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');

-- Task priority levels
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Task status values
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
```

---

## Tables

### 1. profiles

Stores user profile information. Links to `auth.users` via `user_id`.

```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

### 2. user_roles

Stores user roles separately from profiles (security best practice to prevent privilege escalation).

```sql
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

### 3. leads

Stores lead/prospect information with PII fields (email, phone).

```sql
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text,
  notes text,
  status public.lead_status NOT NULL DEFAULT 'new'::lead_status,
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
```

### 4. tasks

Stores tasks assigned to agents.

```sql
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'pending'::task_status,
  priority public.task_priority NOT NULL DEFAULT 'medium'::task_priority,
  assigned_to uuid NOT NULL,
  created_by uuid NOT NULL,
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
```

### 5. activity_logs

Audit trail for all user actions.

```sql
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
```

---

## Views

### leads_masked

A view that masks PII fields (email, phone) using masking functions.

```sql
CREATE OR REPLACE VIEW public.leads_masked AS
SELECT
  id,
  name,
  public.mask_email(email) AS email,
  public.mask_phone(phone) AS phone,
  company,
  source,
  notes,
  status,
  assigned_to,
  created_by,
  created_at,
  updated_at
FROM public.leads;
```

---

## Functions

### 1. has_role (Security Definer)

Checks if a user has a specific role. Uses `SECURITY DEFINER` to bypass RLS and prevent recursion.

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

### 2. get_user_role

Returns the role for a given user.

```sql
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;
```

### 3. is_user_active

Checks if a user's profile is active.

```sql
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;
```

### 4. mask_email

Masks email addresses for privacy (shows first char + domain).

```sql
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
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
```

### 5. mask_phone

Masks phone numbers for privacy (shows last 4 digits).

```sql
CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
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
```

### 6. reveal_lead_pii

Reveals masked PII fields with rate limiting and audit logging.

```sql
CREATE OR REPLACE FUNCTION public.reveal_lead_pii(_lead_id uuid, _field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
```

### 7. update_updated_at_column

Trigger function to auto-update `updated_at` column.

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

### 8. update_last_login

Trigger function to update `last_login_at` on user login.

```sql
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;
```

---

## Triggers

### updated_at Triggers

Apply to tables with `updated_at` column:

```sql
-- Profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Leads
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Last Login Trigger

```sql
-- Attach to auth.users for login tracking
-- Note: This requires special permissions and may need to be set up via Supabase dashboard
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_login();
```

---

## Row Level Security (RLS) Policies

### profiles

```sql
-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### user_roles

```sql
-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view own role
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Admins can insert roles
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update roles
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete roles
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### leads

```sql
-- Admins can view all leads
CREATE POLICY "Admins can view all leads"
  ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can view assigned leads
CREATE POLICY "Agents can view assigned leads"
  ON public.leads FOR SELECT
  USING (assigned_to = auth.uid());

-- Admins can insert leads
CREATE POLICY "Admins can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all leads
CREATE POLICY "Admins can update all leads"
  ON public.leads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can update assigned leads
CREATE POLICY "Agents can update assigned leads"
  ON public.leads FOR UPDATE
  USING (assigned_to = auth.uid());

-- Admins can delete leads
CREATE POLICY "Admins can delete leads"
  ON public.leads FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### tasks

```sql
-- Admins can view all tasks
CREATE POLICY "Admins can view all tasks"
  ON public.tasks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can view own tasks
CREATE POLICY "Agents can view own tasks"
  ON public.tasks FOR SELECT
  USING (assigned_to = auth.uid());

-- Admins can insert tasks
CREATE POLICY "Admins can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all tasks
CREATE POLICY "Admins can update all tasks"
  ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Agents can update own tasks
CREATE POLICY "Agents can update own tasks"
  ON public.tasks FOR UPDATE
  USING (assigned_to = auth.uid());

-- Admins can delete tasks
CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### activity_logs

```sql
-- Admins can view all activity
CREATE POLICY "Admins can view all activity"
  ON public.activity_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view own activity
CREATE POLICY "Users can view own activity"
  ON public.activity_logs FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert own activity
CREATE POLICY "Users can insert own activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Note: UPDATE and DELETE not allowed on activity_logs (audit trail integrity)
```

---

## Complete Migration Script

Run this complete script to recreate the entire database schema:

```sql
-- ============================================
-- COMPLETE DATABASE SCHEMA MIGRATION
-- Lead Management CRM
-- ============================================

-- ==================
-- 1. CREATE ENUMS
-- ==================

CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- ==================
-- 2. CREATE TABLES
-- ==================

-- Profiles table
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Leads table
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text,
  notes text,
  status public.lead_status NOT NULL DEFAULT 'new'::lead_status,
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  status public.task_status NOT NULL DEFAULT 'pending'::task_status,
  priority public.task_priority NOT NULL DEFAULT 'medium'::task_priority,
  assigned_to uuid NOT NULL,
  created_by uuid NOT NULL,
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Activity logs table
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ==================
-- 3. ENABLE RLS
-- ==================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ==================
-- 4. CREATE FUNCTIONS
-- ==================

-- has_role function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- get_user_role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- is_user_active function
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;

-- mask_email function
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
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

-- mask_phone function
CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
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

-- update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_last_login trigger function
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- reveal_lead_pii function (rate-limited PII reveal)
CREATE OR REPLACE FUNCTION public.reveal_lead_pii(_lead_id uuid, _field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  lead_record leads%ROWTYPE;
  user_role app_role;
  result_value text;
  reveal_count integer;
  rate_limit_window interval := interval '1 hour';
  max_reveals_per_hour integer := 20;
BEGIN
  SELECT role INTO user_role FROM user_roles WHERE user_id = auth.uid();
  
  SELECT COUNT(*) INTO reveal_count
  FROM activity_logs
  WHERE user_id = auth.uid()
    AND action IN ('revealed_email', 'revealed_phone')
    AND created_at > (now() - rate_limit_window);
  
  IF reveal_count >= max_reveals_per_hour THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % reveals per hour.', max_reveals_per_hour;
  END IF;
  
  SELECT * INTO lead_record FROM leads WHERE id = _lead_id;
  
  IF lead_record IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  
  IF user_role = 'admin' THEN
    NULL;
  ELSIF user_role = 'agent' THEN
    IF lead_record.assigned_to != auth.uid() THEN
      RAISE EXCEPTION 'Access denied: Lead not assigned to you';
    END IF;
  ELSE
    RAISE EXCEPTION 'Access denied: Invalid role';
  END IF;
  
  IF _field = 'email' THEN
    result_value := lead_record.email;
  ELSIF _field = 'phone' THEN
    result_value := lead_record.phone;
  ELSE
    RAISE EXCEPTION 'Invalid field requested';
  END IF;
  
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

-- ==================
-- 5. CREATE VIEW
-- ==================

CREATE OR REPLACE VIEW public.leads_masked AS
SELECT
  id,
  name,
  public.mask_email(email) AS email,
  public.mask_phone(phone) AS phone,
  company,
  source,
  notes,
  status,
  assigned_to,
  created_by,
  created_at,
  updated_at
FROM public.leads;

-- ==================
-- 6. CREATE TRIGGERS
-- ==================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ==================
-- 7. CREATE RLS POLICIES
-- ==================

-- profiles policies
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- user_roles policies
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- leads policies
CREATE POLICY "Admins can view all leads" ON public.leads FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can view assigned leads" ON public.leads FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "Admins can insert leads" ON public.leads FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all leads" ON public.leads FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can update assigned leads" ON public.leads FOR UPDATE USING (assigned_to = auth.uid());
CREATE POLICY "Admins can delete leads" ON public.leads FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- tasks policies
CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can view own tasks" ON public.tasks FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "Admins can insert tasks" ON public.tasks FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all tasks" ON public.tasks FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can update own tasks" ON public.tasks FOR UPDATE USING (assigned_to = auth.uid());
CREATE POLICY "Admins can delete tasks" ON public.tasks FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- activity_logs policies
CREATE POLICY "Admins can view all activity" ON public.activity_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own activity" ON public.activity_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own activity" ON public.activity_logs FOR INSERT WITH CHECK (user_id = auth.uid());

-- ==================
-- 8. ENABLE REALTIME (Optional)
-- ==================

-- Enable realtime for leads table
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Enable realtime for activity_logs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
```

---

## Edge Functions

The project also includes these Edge Functions (deployed in `supabase/functions/`):

### 1. create-user
Creates new users with profiles and roles (admin only).

### 2. get-client-ip
Returns masked client IP address (requires JWT auth).

### 3. notify-suspicious-activity
Sends email notifications for suspicious security events.

---

## Required Secrets

Configure these secrets in your Supabase project:

| Secret Name | Description |
|-------------|-------------|
| `ADMIN_BOOTSTRAP_SECRET` | Secret for bootstrapping first admin user |
| `RESEND_API_KEY` | API key for Resend email service |
| `ADMIN_NOTIFICATION_EMAIL` | Email address for admin notifications |

---

## Notes for Recreation

1. **Order matters**: Run enums → tables → functions → views → triggers → policies
2. **Auth integration**: The `profiles` and `user_roles` tables link to `auth.users` via `user_id`
3. **Bootstrap admin**: Use the `BootstrapAdmin` page or edge function to create the first admin
4. **Realtime**: Enable publication for tables that need real-time updates
5. **Edge functions**: Deploy separately from `supabase/functions/` directory

---

*Last updated: 2025-12-30*
