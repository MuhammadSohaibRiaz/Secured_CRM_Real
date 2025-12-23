import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Activity, CheckCircle2, Play, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const actionConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  completed_task: { label: 'Completed task', icon: CheckCircle2, color: 'text-success' },
  updated_task_status: { label: 'Updated task status', icon: Play, color: 'text-primary' },
  login: { label: 'Logged in', icon: Activity, color: 'text-muted-foreground' },
};

export function ActivityFeed() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['agent-activity', authUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', authUser?.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: !!authUser?.id,
  });

  // Real-time subscription for new activity logs
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel('agent-activity-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `user_id=eq.${authUser.id}`,
        },
        (payload) => {
          // Update the cache with the new activity
          queryClient.setQueryData(
            ['agent-activity', authUser.id],
            (oldData: ActivityLog[] | undefined) => {
              if (!oldData) return [payload.new as ActivityLog];
              // Add new activity at the beginning, keep only 20
              return [payload.new as ActivityLog, ...oldData].slice(0, 20);
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser?.id, queryClient]);

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
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
        <CardDescription>Your latest actions and updates</CardDescription>
      </CardHeader>
      <CardContent>
        {!activities || activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const config = actionConfig[activity.action] || {
                label: activity.action.replace(/_/g, ' '),
                icon: Activity,
                color: 'text-muted-foreground',
              };
              const Icon = config.icon;

              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1.5 rounded-full bg-muted ${config.color}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{config.label}</p>
                    {activity.details?.new_status && (
                      <p className="text-xs text-muted-foreground">
                        Status: {String(activity.details.new_status).replace('_', ' ')}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </p>
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
