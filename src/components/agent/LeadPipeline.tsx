import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Mail, Building2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Lead = Database['public']['Tables']['leads']['Row'];
type LeadStatus = Database['public']['Enums']['lead_status'];

const stages: { status: LeadStatus; label: string; color: string; bgColor: string }[] = [
  { status: 'new', label: 'New', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30' },
  { status: 'contacted', label: 'Contacted', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10 border-yellow-500/30' },
  { status: 'qualified', label: 'Qualified', color: 'text-purple-500', bgColor: 'bg-purple-500/10 border-purple-500/30' },
  { status: 'converted', label: 'Converted', color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/30' },
  { status: 'lost', label: 'Lost', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30' },
];

export function LeadPipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      toast({ title: 'Error fetching leads', description: error.message, variant: 'destructive' });
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel('pipeline-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads.filter((lead) => lead.status === status);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Lead Pipeline
          <Badge variant="secondary" className="ml-2">
            {leads.length} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {stages.map((stage, index) => {
            const stageLeads = getLeadsByStatus(stage.status);
            return (
              <div key={stage.status} className="flex items-start gap-2">
                <div className={`flex-shrink-0 w-56 rounded-lg border ${stage.bgColor} p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-semibold text-sm ${stage.color}`}>{stage.label}</span>
                    <Badge variant="outline" className={`${stage.color} border-current`}>
                      {stageLeads.length}
                    </Badge>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="space-y-2 pr-2">
                      {stageLeads.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No leads</p>
                      ) : (
                        stageLeads.map((lead) => (
                          <div
                            key={lead.id}
                            className="bg-card border border-border rounded-md p-2.5 hover:border-primary/50 transition-colors cursor-pointer"
                          >
                            <p className="font-medium text-sm text-foreground truncate">{lead.name}</p>
                            {lead.company && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                                <Building2 className="h-3 w-3 flex-shrink-0" />
                                {lead.company}
                              </p>
                            )}
                            {lead.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                {lead.email}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
                {index < stages.length - 1 && (
                  <div className="flex items-center h-48 pt-10">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
