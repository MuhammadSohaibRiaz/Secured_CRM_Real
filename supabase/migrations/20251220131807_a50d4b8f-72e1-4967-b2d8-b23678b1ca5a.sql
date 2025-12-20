-- Create task status enum
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Create task priority enum
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID NOT NULL,
  created_by UUID NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Agents can view their own assigned tasks
CREATE POLICY "Agents can view own tasks"
ON public.tasks
FOR SELECT
USING (assigned_to = auth.uid());

-- Agents can update their own tasks (status, completed_at)
CREATE POLICY "Agents can update own tasks"
ON public.tasks
FOR UPDATE
USING (assigned_to = auth.uid());

-- Admins can view all tasks
CREATE POLICY "Admins can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert tasks
CREATE POLICY "Admins can insert tasks"
ON public.tasks
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all tasks
CREATE POLICY "Admins can update all tasks"
ON public.tasks
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete tasks
CREATE POLICY "Admins can delete tasks"
ON public.tasks
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create activity log table
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own activity
CREATE POLICY "Users can view own activity"
ON public.activity_logs
FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own activity
CREATE POLICY "Users can insert own activity"
ON public.activity_logs
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can view all activity
CREATE POLICY "Admins can view all activity"
ON public.activity_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();