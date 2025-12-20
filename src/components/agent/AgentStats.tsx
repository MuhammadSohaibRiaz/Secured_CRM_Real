import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Clock, CheckCircle2, AlertTriangle, Users, TrendingUp } from 'lucide-react';

export function AgentStats() {
  const { authUser } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['agent-stats', authUser?.id],
    queryFn: async () => {
      const [tasksRes, leadsRes] = await Promise.all([
        supabase.from('tasks').select('status, due_date'),
        supabase.from('leads').select('status'),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const tasks = tasksRes.data || [];
      const leads = leadsRes.data || [];

      const totalTasks = tasks.length;
      const pending = tasks.filter(t => t.status === 'pending').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const overdue = tasks.filter(t => 
        t.due_date && 
        new Date(t.due_date) < new Date() && 
        t.status !== 'completed' && 
        t.status !== 'cancelled'
      ).length;

      const totalLeads = leads.length;
      const convertedLeads = leads.filter(l => l.status === 'converted').length;
      const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

      return { totalTasks, pending, inProgress, completed, overdue, totalLeads, convertedLeads, conversionRate };
    },
    enabled: !!authUser?.id,
  });

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Tasks
          </CardTitle>
          <FileText className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalTasks || 0}</div>
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

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Assigned Leads
          </CardTitle>
          <Users className="h-4 w-4 text-accent" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalLeads || 0}</div>
          <p className="text-xs text-muted-foreground">{stats?.convertedLeads || 0} converted</p>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Conversion Rate
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.conversionRate || 0}%</div>
          <p className="text-xs text-muted-foreground">Lead to customer</p>
        </CardContent>
      </Card>
    </div>
  );
}
