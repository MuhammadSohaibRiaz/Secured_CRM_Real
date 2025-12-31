import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Calendar, Activity, CheckCircle2, XCircle, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { Loader2 } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

interface AgentStats {
    user_id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    last_login_at: string | null;
    total_leads: number;
    new_leads: number;
    contacted_leads: number;
    qualified_leads: number;
    converted_leads: number;
    lost_leads: number;
    total_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    conversion_rate: number;

}

export default function AgentDetails() {
    const { agentId } = useParams();
    const navigate = useNavigate();

    // Fetch Agent Stats
    const { data: agent, isLoading: statsLoading } = useQuery({
        queryKey: ['agent-stats', agentId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('agent_stats' as any)
                .select('*')
                .eq('user_id', agentId)
                .single();

            if (error) throw error;
            return data as unknown as AgentStats;
        },
        enabled: !!agentId
    });

    // Fetch Activity History (Last 7 days)
    const { data: activityData, isLoading: activityLoading } = useQuery({
        queryKey: ['agent-activity-chart', agentId],
        queryFn: async () => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

            const { data, error } = await supabase
                .from('activity_logs')
                .select('created_at, action')
                .eq('user_id', agentId)
                .gte('created_at', sevenDaysAgo.toISOString());

            if (error) throw error;

            // Group by date
            const grouped = (data || []).reduce((acc: any, curr) => {
                const date = format(new Date(curr.created_at), 'MMM dd');
                acc[date] = (acc[date] || 0) + 1;
                return acc;
            }, {});

            // Fill in missing days
            const result = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = format(d, 'MMM dd');
                result.push({
                    date: dateStr,
                    count: grouped[dateStr] || 0
                });
            }
            return result;
        },
        enabled: !!agentId
    });

    if (statsLoading || activityLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!agent) {
        return (
            <div className="container py-8">
                <div className="text-center">
                    <h2 className="text-2xl font-bold">Agent Not Found</h2>
                    <Button onClick={() => navigate('/admin')} className="mt-4">Back to Dashboard</Button>
                </div>
            </div>
        );
    }

    const leadData = [
        { name: 'New', value: agent.new_leads },
        { name: 'Contacted', value: agent.contacted_leads },
        { name: 'Qualified', value: agent.qualified_leads },
        { name: 'Converted', value: agent.converted_leads },
        { name: 'Lost', value: agent.lost_leads },
    ].filter(d => d.value > 0);

    return (
        <div className="min-h-screen bg-background pb-12">
            {/* Header */}
            <div className="bg-card border-b border-border">
                <div className="container py-6">
                    <Button variant="ghost" className="mb-4 pl-0 hover:bg-transparent" onClick={() => navigate('/admin')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Button>

                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-2xl font-bold text-primary">
                                    {agent.full_name.charAt(0)}
                                </span>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold">{agent.full_name}</h1>
                                <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Mail className="h-4 w-4" />
                                        {agent.email}
                                    </div>
                                    <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                                        {agent.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 md:flex md:items-center">
                            <Card className="glass-panel min-w-[140px]">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Conversion Rate
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <div className="text-2xl font-bold text-primary">
                                        {agent.conversion_rate}%
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="glass-panel min-w-[140px]">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Total Leads
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <div className="text-2xl font-bold">
                                        {agent.total_leads}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container py-8 space-y-8">
                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="glass-panel">
                        <CardHeader>
                            <CardTitle>Lead Pipeline Status</CardTitle>
                            <CardDescription>Distribution of assigned leads</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            {leadData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={leadData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {leadData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-muted-foreground">
                                    No leads assigned yet
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="glass-panel">
                        <CardHeader>
                            <CardTitle>Activity (Last 7 Days)</CardTitle>
                            <CardDescription>Actions performed by agent</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            {activityData && activityData.some(d => d.count > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={activityData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                        <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                        <Tooltip
                                            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }}
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                    <Activity className="h-8 w-8 mb-2 opacity-20" />
                                    <p>No recent activity</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Detailed Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{agent.total_tasks}</div>
                            <p className="text-xs text-muted-foreground">
                                {agent.completed_tasks} completed
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
                            <Clock className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{agent.overdue_tasks}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">New Leads</CardTitle>
                            <Shield className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{agent.new_leads}</div>
                            <p className="text-xs text-muted-foreground">Uncontacted</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Lost Leads</CardTitle>
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{agent.lost_leads}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Activity Log Placeholder */}
                {/* We can incorporate the ActivityList component here differently or fetch specific logs */}
            </div>
        </div>
    );
}
