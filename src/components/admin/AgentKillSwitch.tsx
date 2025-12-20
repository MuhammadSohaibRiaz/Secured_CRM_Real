import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Power, Loader2 } from 'lucide-react';

interface AgentKillSwitchProps {
  agentId: string;
  agentUserId: string;
  agentName: string;
  isActive: boolean;
  onStatusChange?: () => void;
}

export function AgentKillSwitch({ 
  agentId, 
  agentUserId, 
  agentName, 
  isActive,
  onStatusChange 
}: AgentKillSwitchProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleStatus = async () => {
    setIsUpdating(true);
    
    try {
      // Update profile is_active status
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          is_active: !isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', agentId);

      if (profileError) throw profileError;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: isActive ? 'disabled_agent' : 'enabled_agent',
          entity_type: 'agent',
          entity_id: agentUserId,
          details: {
            agent_name: agentName,
            new_status: !isActive,
            timestamp: new Date().toISOString(),
          }
        });
      }

      toast.success(
        isActive 
          ? `${agentName}'s access has been revoked immediately` 
          : `${agentName}'s access has been restored`
      );
      
      onStatusChange?.();
    } catch (error) {
      console.error('Error toggling agent status:', error);
      toast.error('Failed to update agent status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant={isActive ? "destructive" : "outline"}
          size="sm"
          disabled={isUpdating}
          className="gap-2"
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {isActive ? 'Disable' : 'Enable'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? 'Disable Agent Access?' : 'Enable Agent Access?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive ? (
              <>
                This will <span className="font-semibold text-destructive">immediately revoke</span> {agentName}'s 
                access to the system. They will be logged out and unable to access any leads or data.
              </>
            ) : (
              <>
                This will <span className="font-semibold text-primary">restore</span> {agentName}'s 
                access to the system. They will be able to log in and access their assigned leads.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleToggleStatus}
            className={isActive ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            {isActive ? 'Disable Access' : 'Enable Access'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}