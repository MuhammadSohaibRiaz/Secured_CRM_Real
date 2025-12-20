import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Lead = Tables<'leads'>;

interface Agent {
  user_id: string;
  full_name: string;
  email: string;
}

interface AssignLeadDialogProps {
  lead: Lead | null;
  agents: Agent[];
  onClose: () => void;
}

export function AssignLeadDialog({ lead, agents, onClose }: AssignLeadDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('unassigned');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (lead?.assigned_to) {
      setSelectedAgent(lead.assigned_to);
    } else {
      setSelectedAgent('unassigned');
    }
  }, [lead]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!lead) return;

      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: selectedAgent === 'unassigned' ? null : selectedAgent })
        .eq('id', lead.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(selectedAgent !== 'unassigned' ? 'Lead assigned successfully' : 'Lead unassigned');
      onClose();
    },
    onError: () => {
      toast.error('Failed to assign lead');
    },
  });

  if (!lead) return null;

  return (
    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Lead</DialogTitle>
          <DialogDescription>
            Assign "{lead.name}" to an agent for follow-up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.user_id} value={agent.user_id}>
                    {agent.full_name} ({agent.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!agents.length && (
            <p className="text-sm text-muted-foreground">
              No active agents available. Create an agent first.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedAgent !== 'unassigned' ? 'Assign' : 'Unassign'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
