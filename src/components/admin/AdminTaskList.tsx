import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ListTodo, CheckCircle2, Clock, AlertCircle, CircleDashed, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string;
  due_date: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
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

export function AdminTaskList() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['admin-tasks'],
    queryFn: async () => {
      // Get tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (tasksError) throw tasksError;

      // Get profiles for assigned agents
      const assignedToIds = [...new Set(tasksData?.map(t => t.assigned_to) || [])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', assignedToIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return tasksData?.map(task => ({
        ...task,
        profiles: { full_name: profileMap.get(task.assigned_to) || 'Unknown' }
      })) as Task[];
    },
  });

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
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-primary" />
          Recent Tasks
        </CardTitle>
        <CardDescription>Tasks assigned to agents</CardDescription>
      </CardHeader>
      <CardContent>
        {!tasks || tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ListTodo className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No tasks yet. Create your first task.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const StatusIcon = statusConfig[task.status].icon;
              
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50"
                >
                  <div className={`mt-0.5 ${statusConfig[task.status].color}`}>
                    <StatusIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{task.title}</span>
                      <Badge variant={priorityConfig[task.priority].variant} className="text-xs">
                        {priorityConfig[task.priority].label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.profiles?.full_name || 'Unknown'}
                      </span>
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(task.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {statusConfig[task.status].label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
