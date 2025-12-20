import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Building2, GripVertical } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

type Lead = Database['public']['Tables']['leads']['Row'];
type LeadStatus = Database['public']['Enums']['lead_status'];

const stages: { status: LeadStatus; label: string; color: string; borderColor: string }[] = [
  { status: 'new', label: 'New', color: 'bg-blue-500', borderColor: 'border-blue-500/40' },
  { status: 'contacted', label: 'Contacted', color: 'bg-amber-500', borderColor: 'border-amber-500/40' },
  { status: 'qualified', label: 'Qualified', color: 'bg-violet-500', borderColor: 'border-violet-500/40' },
  { status: 'converted', label: 'Converted', color: 'bg-emerald-500', borderColor: 'border-emerald-500/40' },
  { status: 'lost', label: 'Lost', color: 'bg-rose-500', borderColor: 'border-rose-500/40' },
];

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
}

function LeadCard({ lead, isDragging }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{lead.name}</p>
          {lead.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5 truncate">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.company}</span>
            </p>
          )}
          {lead.email && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{lead.name}</p>
          {lead.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5 truncate">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.company}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface StageColumnProps {
  stage: typeof stages[0];
  leads: Lead[];
  isOver: boolean;
}

function StageColumn({ stage, leads, isOver }: StageColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage.status });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-xl border-2 transition-all duration-200 ${
        isOver 
          ? `${stage.borderColor} bg-accent/50 scale-[1.02]` 
          : 'border-border/50 bg-muted/30'
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
            <span className="font-semibold text-sm text-foreground">{stage.label}</span>
          </div>
          <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">
            {leads.length}
          </Badge>
        </div>
        <ScrollArea className="h-[320px]">
          <div className="space-y-2.5 pr-2">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className={`w-10 h-10 rounded-full ${stage.color}/10 flex items-center justify-center mb-2`}>
                  <div className={`w-3 h-3 rounded-full ${stage.color}/40`} />
                </div>
                <p className="text-xs text-muted-foreground">No leads</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Drop leads here</p>
              </div>
            ) : (
              leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function LeadPipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as LeadStatus;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // Optimistically update the UI
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );

    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      // Revert on error
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l))
      );
      toast({
        title: 'Failed to update lead',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Lead updated',
        description: `${lead.name} moved to ${stages.find((s) => s.status === newStatus)?.label}`,
      });
    }
  };

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Lead Pipeline</CardTitle>
          <Badge variant="outline" className="font-medium">
            {leads.length} total leads
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stages.map((stage) => (
              <StageColumn
                key={stage.status}
                stage={stage}
                leads={getLeadsByStatus(stage.status)}
                isOver={overId === stage.status}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? <DraggableLeadCard lead={activeLead} /> : null}
          </DragOverlay>
        </DndContext>
      </CardContent>
    </Card>
  );
}
