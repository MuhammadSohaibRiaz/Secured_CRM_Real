import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, Enums } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Mail, Phone, Building2, Calendar, User, Save, Clock, MessageSquare, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { MaskedField } from '@/components/ui/masked-field';

type Lead = Tables<'leads'>;
type LeadStatus = Enums<'lead_status'>;

interface LeadDetailsDialogProps {
  lead: Lead | null;
  onClose: () => void;
}

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  qualified: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  converted: 'bg-green-500/20 text-green-400 border-green-500/30',
  lost: 'bg-destructive/20 text-destructive border-destructive/30',
};

export function LeadDetailsDialog({ lead, onClose }: LeadDetailsDialogProps) {
  const [notes, setNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '');
      setHasChanges(false);
    }
  }, [lead]);

  // Fetch assigned agent details
  const { data: assignedAgent } = useQuery({
    queryKey: ['agent-details', lead?.assigned_to],
    queryFn: async () => {
      if (!lead?.assigned_to) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', lead.assigned_to)
        .maybeSingle();
      return data;
    },
    enabled: !!lead?.assigned_to,
  });

  // Fetch activity logs for this lead
  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['lead-activities', lead?.id],
    queryFn: async () => {
      if (!lead?.id) return [];
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_type', 'lead')
        .eq('entity_id', lead.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!lead?.id,
  });

  const updateNotesMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !user) return;

      const { error } = await supabase
        .from('leads')
        .update({ notes: notes.trim() || null })
        .eq('id', lead.id);

      if (error) throw error;

      // Log the activity
      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action: 'updated_notes',
        entity_type: 'lead',
        entity_id: lead.id,
        details: { note_preview: notes.trim().substring(0, 100) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', lead?.id] });
      setHasChanges(false);
      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(value !== (lead?.notes || ''));
  };

  if (!lead) return null;

  return (
    <Sheet open={!!lead} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl">{lead.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge className={statusColors[lead.status]} variant="outline">
                  {lead.status}
                </Badge>
                {lead.source && (
                  <span className="text-xs text-muted-foreground">via {lead.source}</span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Contact Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Contact Information
              </h3>
              <div className="grid gap-3">
                {lead.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <MaskedField 
                      value={lead.email} 
                      type="email" 
                      entityId={lead.id}
                    />
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <MaskedField 
                      value={lead.phone} 
                      type="phone" 
                      entityId={lead.id}
                    />
                  </div>
                )}
                {lead.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{lead.company}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Assignment & Dates */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Details
              </h3>
              <div className="grid gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Assigned to:{' '}
                    <span className={assignedAgent ? 'text-foreground' : 'text-muted-foreground'}>
                      {assignedAgent?.full_name || 'Unassigned'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Created: {format(new Date(lead.created_at), 'PPP')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Updated: {format(new Date(lead.updated_at), 'PPP p')}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Notes
                </h3>
                {hasChanges && (
                  <Button
                    size="sm"
                    onClick={() => updateNotesMutation.mutate()}
                    disabled={updateNotesMutation.isPending}
                  >
                    {updateNotesMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3 w-3" />
                    )}
                    Save
                  </Button>
                )}
              </div>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={4}
                className="resize-none"
              />
            </div>

            <Separator />

            {/* Activity History */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Activity History
              </h3>
              
              {activitiesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activities?.length ? (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 text-sm p-3 rounded-lg bg-muted/50"
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">
                          {formatActivityAction(activity.action)}
                        </p>
                        {activity.details && typeof activity.details === 'object' && 'note_preview' in activity.details && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            "{(activity.details as { note_preview: string }).note_preview}"
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(activity.created_at), 'PPP p')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No activity recorded yet.
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function formatActivityAction(action: string): string {
  const actions: Record<string, string> = {
    updated_notes: 'Notes were updated',
    status_changed: 'Status was changed',
    assigned: 'Lead was assigned',
    created: 'Lead was created',
    revealed_email: 'Email was revealed',
    revealed_phone: 'Phone was revealed',
  };
  return actions[action] || action.replace(/_/g, ' ');
}
