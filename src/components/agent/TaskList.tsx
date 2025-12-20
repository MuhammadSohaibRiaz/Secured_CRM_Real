import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Clock, AlertCircle, CircleDashed, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

const statusConfig: Record<TaskStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: 'Pending', icon: CircleDashed, color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-warning' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-success' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, color: 'text-destructive' },
};

const priorityConfig: Record<TaskPriority, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

export function TaskList() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['agent-tasks', authUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!authUser?.id,
  });

  // Subscribe to realtime updates for tasks
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel('agent-tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assigned_to=eq.${authUser.id}`,
        },
        (payload) => {
          console.log('Task realtime update:', payload);
          queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
          
          if (payload.eventType === 'INSERT') {
            toast.info('New task assigned to you!');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser?.id, queryClient]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const updates: { status: TaskStatus; completed_at?: string | null } = { status };
      
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }

      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        user_id: authUser?.id,
        action: status === 'completed' ? 'completed_task' : 'updated_task_status',
        entity_type: 'task',
        entity_id: taskId,
        details: { new_status: status },
      });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agent-activity'] });
      queryClient.invalidateQueries({ queryKey: ['agent-stats'] });
      toast.success(status === 'completed' ? 'Task completed!' : 'Task status updated');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const filteredTasks = tasks?.filter(task => 
    statusFilter === 'all' || task.status === statusFilter
  ) ?? [];

  if (isLoading) {
    return (
      <Card className="glass-panel">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              My Tasks
            </CardTitle>
            <CardDescription>Manage your assigned tasks</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              {statusFilter === 'all' ? 'No tasks assigned yet.' : `No ${statusFilter.replace('_', ' ')} tasks.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const StatusIcon = statusConfig[task.status].icon;
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
              
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className={`mt-1 ${statusConfig[task.status].color}`}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground truncate">{task.title}</h4>
                      <Badge variant={priorityConfig[task.priority].variant} className="text-xs">
                        {priorityConfig[task.priority].label}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
                          {isOverdue && ' (Overdue)'}
                        </span>
                      )}
                      {task.completed_at && (
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Completed: {format(new Date(task.completed_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status !== 'completed' && task.status !== 'cancelled' && (
                      <>
                        {task.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ taskId: task.id, status: 'in_progress' })}
                            disabled={updateStatusMutation.isPending}
                          >
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ taskId: task.id, status: 'completed' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Complete'
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
