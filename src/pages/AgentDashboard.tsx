import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { User, LogOut, Loader2 } from 'lucide-react';
import { AgentStats } from '@/components/agent/AgentStats';
import { TaskList } from '@/components/agent/TaskList';
import { ActivityFeed } from '@/components/agent/ActivityFeed';
import { AgentLeadList } from '@/components/agent/AgentLeadList';
import { LeadPipeline } from '@/components/agent/LeadPipeline';

export default function AgentDashboard() {
  const { isLoading, user } = useRequireAuth('agent');
  const { signOut } = useAuth();

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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <User className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Agent Workspace</h1>
              <p className="text-xs text-muted-foreground">Task Management</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{user?.fullName}</span>
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
          <h2 className="text-2xl font-bold text-foreground">Welcome, {user?.fullName}</h2>
          <p className="text-muted-foreground">Here's an overview of your tasks and activity.</p>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <AgentStats />
        </div>

        {/* Lead Pipeline */}
        <div className="mb-8">
          <LeadPipeline />
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <TaskList />
            <AgentLeadList />
          </div>
          <div>
            <ActivityFeed />
          </div>
        </div>
      </main>

      {/* Watermark overlay */}
      <div className="fixed bottom-4 right-4 text-xs text-muted-foreground/20 pointer-events-none select-none">
        {user?.fullName} | {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
