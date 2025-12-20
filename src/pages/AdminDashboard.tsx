import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, ListTodo, Activity, LogOut, Loader2, UserCheck, Eye } from 'lucide-react';
import { AgentList } from '@/components/admin/AgentList';
import { CreateAgentDialog } from '@/components/admin/CreateAgentDialog';
import { CreateTaskDialog } from '@/components/admin/CreateTaskDialog';
import { AdminTaskList } from '@/components/admin/AdminTaskList';
import { LeadList } from '@/components/admin/LeadList';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';
import { ActivityDashboard } from '@/components/admin/ActivityDashboard';
import { SecurityWatermark } from '@/components/ui/security-watermark';

export default function AdminDashboard() {
  const { isLoading, user } = useRequireAuth('admin');
  const { signOut } = useAuth();

  // Fetch agent stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      // Agent stats
      const { data: agentRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');

      if (rolesError) throw rolesError;

      let totalAgents = 0;
      let activeAgents = 0;

      if (agentRoles && agentRoles.length > 0) {
        const agentUserIds = agentRoles.map(r => r.user_id);

        const { data: profiles } = await supabase
          .from('profiles')
          .select('is_active')
          .in('user_id', agentUserIds);

        totalAgents = profiles?.length || 0;
        activeAgents = profiles?.filter(p => p.is_active).length || 0;
      }

      // Task stats
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status');

      const totalTasks = tasks?.length || 0;
      const pendingTasks = tasks?.filter(t => t.status === 'pending' || t.status === 'in_progress').length || 0;

      // Lead stats
      const { data: leads } = await supabase
        .from('leads')
        .select('status');

      const totalLeads = leads?.length || 0;
      const newLeads = leads?.filter(l => l.status === 'new').length || 0;

      return { totalAgents, activeAgents, totalTasks, pendingTasks, totalLeads, newLeads };
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Agent & Task Management</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user?.fullName}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Welcome back, {user?.fullName}</h2>
          <p className="text-muted-foreground">Manage your agents and tasks from here.</p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Agents
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalAgents ?? 0}</div>
              <p className="text-xs text-muted-foreground">Registered agents</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Agents
              </CardTitle>
              <Activity className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeAgents ?? 0}</div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tasks
              </CardTitle>
              <ListTodo className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalTasks ?? 0}</div>
              <p className="text-xs text-muted-foreground">All assigned tasks</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Leads
              </CardTitle>
              <UserCheck className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalLeads ?? 0}</div>
              <p className="text-xs text-muted-foreground">All tracked leads</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                New Leads
              </CardTitle>
              <Shield className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.newLeads ?? 0}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Agents, Tasks, Leads, and Activity */}
        <Tabs defaultValue="agents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agents" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents">
            <Card className="glass-panel">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Agent Management
                  </CardTitle>
                  <CardDescription>
                    Create and manage agent accounts
                  </CardDescription>
                </div>
                <CreateAgentDialog />
              </CardHeader>
              <CardContent>
                <AgentList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Card className="glass-panel">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ListTodo className="h-5 w-5 text-primary" />
                        Task Management
                      </CardTitle>
                      <CardDescription>
                        Assign and track agent tasks
                      </CardDescription>
                    </div>
                    <CreateTaskDialog />
                  </CardHeader>
                  <CardContent>
                    <AdminTaskList />
                  </CardContent>
                </Card>
              </div>
              <div>
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <CreateTaskDialog />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="leads">
            <Card className="glass-panel">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    Lead Management
                  </CardTitle>
                  <CardDescription>
                    Track and assign leads to agents
                  </CardDescription>
                </div>
                <CreateLeadDialog />
              </CardHeader>
              <CardContent>
                <LeadList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <ActivityDashboard />
          </TabsContent>
        </Tabs>
      </main>

      {/* Security Watermark */}
      <SecurityWatermark opacity={0.02} />
    </div>
  );
}
