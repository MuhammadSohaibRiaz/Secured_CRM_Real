import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

export function AgentStats() {
  const { authUser } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['agent-stats', authUser?.id],
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('status, due_date');

      if (error) throw error;

      const total = tasks?.length || 0;
      const pending = tasks?.filter(t => t.status === 'pending').length || 0;
      const inProgress = tasks?.filter(t => t.status === 'in_progress').length || 0;
      const completed = tasks?.filter(t => t.status === 'completed').length || 0;
      const overdue = tasks?.filter(t => 
        t.due_date && 
        new Date(t.due_date) < new Date() && 
        t.status !== 'completed' && 
        t.status !== 'cancelled'
      ).length || 0;

      return { total, pending, inProgress, completed, overdue };
    },
    enabled: !!authUser?.id,
  });

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Tasks
          </CardTitle>
          <FileText className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.total || 0}</div>
          <p className="text-xs text-muted-foreground">Assigned to you</p>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            In Progress
          </CardTitle>
          <Clock className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{(stats?.pending || 0) + (stats?.inProgress || 0)}</div>
          <p className="text-xs text-muted-foreground">Active tasks</p>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Completed
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.completed || 0}</div>
          <p className="text-xs text-muted-foreground">Tasks done</p>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overdue
          </CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.overdue || 0}</div>
          <p className="text-xs text-muted-foreground">Need attention</p>
        </CardContent>
      </Card>
    </div>
  );
}
