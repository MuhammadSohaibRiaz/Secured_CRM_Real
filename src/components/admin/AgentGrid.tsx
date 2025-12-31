import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ArrowRight, User } from 'lucide-react';

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

export function AgentGrid() {
    const navigate = useNavigate();

    const { data: agents, isLoading } = useQuery({
        queryKey: ['agent-grid-stats'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('agent_stats' as any)
                .select('*')
                .order('total_leads', { ascending: false });

            if (error) throw error;
            return data as unknown as AgentStats[];
        },
    });

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!agents || agents.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                No agents found. Create an agent to see stats.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
                <Card
                    key={agent.user_id}
                    className="group hover:border-primary/50 transition-colors cursor-pointer relative overflow-hidden"
                    onClick={() => navigate(`/admin/agents/${agent.user_id}`)}
                >
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />

                    <CardHeader className="flex flex-row items-start justify-between pb-2 pl-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-bold">{agent.full_name}</CardTitle>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    {agent.email}
                                </div>
                            </div>
                        </div>
                        <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                            {agent.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </CardHeader>

                    <CardContent className="pl-6 pt-2">
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground">Total Leads</p>
                                <p className="text-xl font-bold">{agent.total_leads}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Conversion</p>
                                <p className="text-xl font-bold text-green-500">{agent.conversion_rate}%</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Total Tasks</p>
                                <p className="text-xl font-bold">{agent.total_tasks}</p>
                            </div>
                        </div>

                        <div className="w-full h-1 bg-secondary rounded-full overflow-hidden mb-4" title={`Conversion Rate: ${agent.conversion_rate}%`}>
                            <div
                                className="h-full bg-primary"
                                style={{ width: `${agent.conversion_rate}%` }}
                            />
                        </div>

                        <Button variant="ghost" className="w-full justify-between hover:bg-transparent group-hover:text-primary p-0 h-auto">
                            View Performance
                            <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
