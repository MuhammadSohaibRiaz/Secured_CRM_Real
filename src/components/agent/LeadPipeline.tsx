import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Building2, GripVertical, ChevronRight, ArrowDown } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LeadDetailsDialog } from '@/components/admin/LeadDetailsDialog';
import { MaskedField } from '@/components/ui/masked-field';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';

type Lead = Database['public']['Tables']['leads']['Row'];
type LeadStatus = Database['public']['Enums']['lead_status'];

const stages: { status: LeadStatus; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { status: 'new', label: 'New', color: 'bg-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  { status: 'contacted', label: 'Contacted', color: 'bg-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  { status: 'qualified', label: 'Qualified', color: 'bg-violet-500', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/30' },
  { status: 'converted', label: 'Converted', color: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
  { status: 'lost', label: 'Lost', color: 'bg-rose-500', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/30' },
];

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  onClick: () => void;
}

function LeadCard({ lead, isDragging, onClick }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition || 'transform 200ms ease',
    zIndex: isSortableDragging ? 50 : undefined,
    touchAction: 'none' as const,
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging
    if (!transform) {
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group bg-card border border-border/60 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
        isDragging || isSortableDragging
          ? 'opacity-40 scale-95' 
          : 'hover:shadow-md hover:border-primary/40 hover:scale-[1.01]'
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <div className="p-0.5 pointer-events-none">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
        </div>
        <div className="flex-1 min-w-0 pointer-events-none">
          <p className="font-medium text-sm text-foreground truncate">
            {lead.name}
          </p>
          {lead.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5 truncate">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.company}</span>
            </p>
          )}
          {lead.email && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 pointer-events-auto">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <MaskedField 
                value={lead.email} 
                type="email" 
                entityId={lead.id}
                className="text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-card border-2 border-primary/50 rounded-lg p-3 shadow-2xl ring-4 ring-primary/20 animate-pulse-soft scale-105 rotate-1">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
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
  onLeadClick: (lead: Lead) => void;
}

function StageColumn({ stage, leads, isOver, onLeadClick }: StageColumnProps) {
  const { setNodeRef } = useDroppable({ id: stage.status });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border transition-all duration-200 h-full min-h-[180px] ${
        isOver 
          ? `border-2 ${stage.borderColor} ${stage.bgColor} shadow-lg ring-2 ring-offset-2 ring-offset-background ${stage.borderColor.replace('border-', 'ring-')}` 
          : 'border-border/40 bg-muted/20 hover:border-border/60'
      }`}
    >
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${stage.color} ${isOver ? 'animate-pulse' : ''}`} />
            <span className="font-semibold text-sm text-foreground">{stage.label}</span>
          </div>
          <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5 bg-background/80">
            {leads.length}
          </Badge>
        </div>
        <div className="space-y-2 flex-1 min-h-[60px]">
          {leads.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-6 text-center rounded-lg border-2 border-dashed transition-all ${
              isOver ? `${stage.borderColor} ${stage.bgColor}` : 'border-muted-foreground/20'
            }`}>
              <div className={`w-8 h-8 rounded-full ${stage.bgColor} flex items-center justify-center mb-2`}>
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{isOver ? 'Release to drop' : 'Drop leads here'}</p>
            </div>
          ) : (
            leads.map((lead) => (
              <LeadCard 
                key={lead.id} 
                lead={lead} 
                onClick={() => onLeadClick(lead)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FlowArrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex justify-center py-2">
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-gradient-to-b from-border to-muted-foreground/40" />
          <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center px-1">
      <div className="flex items-center">
        <div className="w-4 h-px bg-gradient-to-r from-border to-muted-foreground/40" />
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 -ml-1" />
      </div>
    </div>
  );
}

export function LeadPipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
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

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  // Separate main flow from lost
  const mainStages = stages.filter(s => s.status !== 'lost');
  const lostStage = stages.find(s => s.status === 'lost')!;

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
    <>
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Lead Pipeline</CardTitle>
            <Badge variant="outline" className="font-medium">
              {leads.length} total leads
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Row 1: New → Contacted → Qualified */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {mainStages.slice(0, 3).map((stage) => (
                <StageColumn
                  key={stage.status}
                  stage={stage}
                  leads={getLeadsByStatus(stage.status)}
                  isOver={overId === stage.status}
                  onLeadClick={handleLeadClick}
                />
              ))}
            </div>

            {/* Row 2: Converted + Lost */}
            <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
              <StageColumn
                stage={mainStages[3]}
                leads={getLeadsByStatus(mainStages[3].status)}
                isOver={overId === mainStages[3].status}
                onLeadClick={handleLeadClick}
              />
              <StageColumn
                stage={lostStage}
                leads={getLeadsByStatus(lostStage.status)}
                isOver={overId === lostStage.status}
                onLeadClick={handleLeadClick}
              />
            </div>

            <DragOverlay>
              {activeLead ? <DraggableLeadCard lead={activeLead} /> : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>

      <LeadDetailsDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </>
  );
}
