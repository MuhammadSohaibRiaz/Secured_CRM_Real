import { useState, useCallback } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from './button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MaskedFieldProps {
  value: string | null | undefined;
  type: 'email' | 'phone';
  entityId: string;
  entityType?: string;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return '***@***';
  
  const maskedLocal = localPart.length > 2 
    ? `${localPart[0]}${'*'.repeat(Math.min(localPart.length - 1, 5))}` 
    : '*'.repeat(localPart.length);
  
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone: string): string {
  // Remove all non-digit characters for processing
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 4) return '*'.repeat(phone.length);
  
  // Show last 4 digits, mask the rest
  const lastFour = digits.slice(-4);
  const maskedPart = '*'.repeat(Math.max(digits.length - 4, 0));
  
  // Try to preserve original formatting
  if (phone.includes('(')) {
    return `(***) ***-${lastFour}`;
  }
  return `${maskedPart}${lastFour}`;
}

export function MaskedField({ 
  value, 
  type, 
  entityId, 
  entityType = 'lead',
  className,
  iconClassName,
  showIcon = true 
}: MaskedFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const { authUser } = useAuth();

  const maskedValue = value 
    ? (type === 'email' ? maskEmail(value) : maskPhone(value))
    : null;

  const logReveal = useCallback(async () => {
    if (!authUser?.id || !value) return;

    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: authUser.id,
          action: `revealed_${type}`,
          entity_type: entityType,
          entity_id: entityId,
          details: {
            field_type: type,
            timestamp: new Date().toISOString(),
          }
        });

      if (error) {
        console.error('Failed to log reveal:', error);
      }
    } catch (err) {
      console.error('Error logging reveal:', err);
    }
  }, [authUser?.id, entityId, entityType, type, value]);

  const handleReveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!value) return;
    
    if (!isRevealed) {
      setIsLogging(true);
      await logReveal();
      setIsLogging(false);
      setIsRevealed(true);
    } else {
      setIsRevealed(false);
    }
  };

  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 group", className)}>
      <span className={cn(
        "transition-all duration-200",
        isRevealed ? "text-foreground" : "text-muted-foreground font-mono"
      )}>
        {isRevealed ? value : maskedValue}
      </span>
      {showIcon && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-5 w-5 opacity-60 hover:opacity-100 transition-opacity",
            iconClassName
          )}
          onClick={handleReveal}
          disabled={isLogging}
          title={isRevealed ? 'Hide' : 'Reveal (logged)'}
        >
          {isLogging ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isRevealed ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </Button>
      )}
    </span>
  );
}
