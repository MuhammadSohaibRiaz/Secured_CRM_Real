import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Activity, 
  Eye, 
  AlertTriangle, 
  RefreshCw, 
  Search,
  User,
  Clock,
  Mail,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ActivityLog = Database['public']['Tables']['activity_logs']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface EnrichedActivityLog extends ActivityLog {
  profile?: Profile | null;
}

interface SuspiciousPattern {
  userId: string;
  userName: string;
  userEmail: string;
  revealCount: number;
  timeWindowMinutes: number;
  recentActions: Array<{
    action: string;
    timestamp: string;
  }>;
}

const SUSPICIOUS_THRESHOLD = 3; // More than 3 reveals in 2 minutes is suspicious (lowered for testing)
const TIME_WINDOW_MINUTES = 2;

export function ActivityDashboard() {
  const [activities, setActivities] = useState<EnrichedActivityLog[]>([]);
  const [suspiciousPatterns, setSuspiciousPatterns] = useState<SuspiciousPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string | null>(null);
  const [sendingAlert, setSendingAlert] = useState<string | null>(null);
  const notifiedUsers = useRef<Set<string>>(new Set());

  const sendSuspiciousActivityAlert = async (pattern: SuspiciousPattern, isAutomatic = false) => {
    // Skip if already notified
    if (notifiedUsers.current.has(pattern.userId)) {
      return;
    }

    if (!isAutomatic) {
      setSendingAlert(pattern.userId);
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('notify-suspicious-activity', {
        body: {
          agentId: pattern.userId,
          agentName: pattern.userName,
          agentEmail: pattern.userEmail,
          revealCount: pattern.revealCount,
          timeWindowMinutes: pattern.timeWindowMinutes,
          recentActions: pattern.recentActions,
        },
      });

      if (error) throw error;
      
      notifiedUsers.current.add(pattern.userId);
      if (isAutomatic) {
        toast.warning(`🚨 Automatic security alert sent for ${pattern.userName}`, {
          description: `${pattern.revealCount} data reveals in ${pattern.timeWindowMinutes} minutes`,
          duration: 10000,
        });
      } else {
        toast.success(`Security alert sent for ${pattern.userName}`);
      }
    } catch (error) {
      console.error('Failed to send alert:', error);
      if (!isAutomatic) {
        toast.error('Failed to send security alert');
      }
    } finally {
      if (!isAutomatic) {
        setSendingAlert(null);
      }
    }
  };

  const fetchActivities = async () => {
    setLoading(true);
    
    // Fetch recent activity logs
    const { data: logs, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error fetching activities:', error);
      setLoading(false);
      return;
    }

    // Fetch profiles for all unique user_ids
    const userIds = [...new Set(logs?.map(log => log.user_id) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('user_id', userIds);

    // Enrich logs with profile data
    const enrichedLogs: EnrichedActivityLog[] = (logs || []).map(log => ({
      ...log,
      profile: profiles?.find(p => p.user_id === log.user_id) || null,
    }));

    setActivities(enrichedLogs);

    // Detect suspicious patterns
    detectSuspiciousPatterns(enrichedLogs);
    
    setLoading(false);
  };

  const detectSuspiciousPatterns = (logs: EnrichedActivityLog[]) => {
    const now = new Date();
    const timeWindow = TIME_WINDOW_MINUTES * 60 * 1000; // Convert to milliseconds
    
    // Filter to recent reveal actions
    const recentReveals = logs.filter(log => {
      const logTime = new Date(log.created_at);
      const isRecent = (now.getTime() - logTime.getTime()) < timeWindow;
      const isReveal = log.action.includes('revealed');
      return isRecent && isReveal;
    });

    // Group by user with actions
    const userRevealData: Record<string, { 
      count: number; 
      name: string; 
      email: string;
      actions: Array<{ action: string; timestamp: string }>;
    }> = {};
    
    recentReveals.forEach(log => {
      if (!userRevealData[log.user_id]) {
        userRevealData[log.user_id] = { 
          count: 0, 
          name: log.profile?.full_name || 'Unknown User',
          email: log.profile?.email || '',
          actions: []
        };
      }
      userRevealData[log.user_id].count++;
      userRevealData[log.user_id].actions.push({
        action: log.action,
        timestamp: log.created_at
      });
    });

    // Find suspicious users
    const suspicious: SuspiciousPattern[] = Object.entries(userRevealData)
      .filter(([_, data]) => data.count >= SUSPICIOUS_THRESHOLD)
      .map(([userId, data]) => ({
        userId,
        userName: data.name,
        userEmail: data.email,
        revealCount: data.count,
        timeWindowMinutes: TIME_WINDOW_MINUTES,
        recentActions: data.actions,
      }));

    setSuspiciousPatterns(suspicious);

    // Automatically send alerts for new suspicious patterns
    suspicious.forEach(pattern => {
      if (!notifiedUsers.current.has(pattern.userId)) {
        sendSuspiciousActivityAlert(pattern, true);
      }
    });
  };

  useEffect(() => {
    fetchActivities();

    // Set up realtime subscription
    const channel = supabase
      .channel('activity-logs-realtime')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'activity_logs' 
      }, () => {
        fetchActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getActionBadge = (action: string) => {
    if (action.includes('revealed_email')) {
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">Email Reveal</Badge>;
    }
    if (action.includes('revealed_phone')) {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">Phone Reveal</Badge>;
    }
    if (action.includes('login')) {
      return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">Login</Badge>;
    }
    if (action.includes('update')) {
      return <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30">Update</Badge>;
    }
    return <Badge variant="outline">{action}</Badge>;
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = searchQuery === '' || 
      activity.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.action.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterAction === null || activity.action.includes(filterAction);
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Suspicious Activity Alerts */}
      {suspiciousPatterns.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Suspicious Activity Detected
            </CardTitle>
            <CardDescription>
              The following users have an unusually high number of data reveals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suspiciousPatterns.map(pattern => (
                <div 
                  key={pattern.userId}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{pattern.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {pattern.revealCount} reveals in {pattern.timeWindowMinutes} minutes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => sendSuspiciousActivityAlert(pattern)}
                      disabled={sendingAlert === pattern.userId || notifiedUsers.current.has(pattern.userId)}
                    >
                      {sendingAlert === pattern.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Mail className="h-4 w-4 mr-1" />
                      )}
                      {notifiedUsers.current.has(pattern.userId) ? 'Alert Sent' : 'Resend Alert'}
                    </Button>
                    <Badge variant="destructive">High Risk</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Real-Time Activity Feed
              </CardTitle>
              <CardDescription>
                Monitor all agent actions in real-time
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchActivities}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          
          {/* Filters */}
          <div className="flex gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user or action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant={filterAction === null ? "secondary" : "outline"} 
                size="sm"
                onClick={() => setFilterAction(null)}
              >
                All
              </Button>
              <Button 
                variant={filterAction === 'revealed' ? "secondary" : "outline"} 
                size="sm"
                onClick={() => setFilterAction('revealed')}
              >
                <Eye className="h-4 w-4 mr-1" />
                Reveals
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activities found
                </div>
              ) : (
                filteredActivities.map((activity) => (
                  <div 
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {activity.profile?.full_name || 'Unknown User'}
                        </span>
                        {getActionBadge(activity.action)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Entity: {activity.entity_type}
                        {activity.entity_id && ` (${activity.entity_id.slice(0, 8)}...)`}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}