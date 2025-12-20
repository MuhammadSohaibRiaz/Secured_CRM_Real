import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { z } from 'zod';

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignedTo: z.string().uuid('Please select an agent'),
  dueDate: z.string().optional(),
});

interface Agent {
  user_id: string;
  full_name: string;
  email: string;
}

export function CreateTaskDialog() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: agents } = useQuery({
    queryKey: ['agents-for-task'],
    queryFn: async () => {
      const { data: agentRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');

      if (rolesError) throw rolesError;
      if (!agentRoles || agentRoles.length === 0) return [];

      const agentUserIds = agentRoles.map(r => r.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', agentUserIds)
        .eq('is_active', true);

      if (profilesError) throw profilesError;
      return profiles as Agent[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createTaskSchema>) => {
      const { error } = await supabase.from('tasks').insert({
        title: data.title,
        description: data.description || null,
        priority: data.priority,
        assigned_to: data.assignedTo,
        created_by: authUser?.id,
        due_date: data.dueDate ? new Date(data.dueDate).toISOString() : null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tasks'] });
      toast.success('Task created successfully');
      resetForm();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create task');
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setAssignedTo('');
    setDueDate('');
    setErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = createTaskSchema.safeParse({
      title,
      description,
      priority,
      assignedTo,
      dueDate: dueDate || undefined,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    createMutation.mutate(result.data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Assign Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Assign a new task to an agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title"
              />
              {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter task description (optional)"
                rows={3}
              />
              {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assign To *</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.user_id} value={agent.user_id}>
                        {agent.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.assignedTo && <p className="text-sm text-destructive">{errors.assignedTo}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
