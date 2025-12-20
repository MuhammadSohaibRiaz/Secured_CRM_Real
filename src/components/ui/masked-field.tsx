import { useState, useCallback, useEffect, useRef } from 'react';
import { Eye, EyeOff, Loader2, Timer } from 'lucide-react';
import { Button } from './button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface MaskedFieldProps {
  value: string | null | undefined;
  type: 'email' | 'phone';
  entityId: string;
  entityType?: string;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
  autoHideSeconds?: number; // Time-limited exposure (default: 60)
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
  showIcon = true,
  autoHideSeconds = 60 
}: MaskedFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(autoHideSeconds);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const { authUser } = useAuth();

  const maskedValue = value 
    ? (type === 'email' ? maskEmail(value) : maskPhone(value))
    : null;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Handle auto-hide timer
  useEffect(() => {
    if (isRevealed && autoHideSeconds > 0) {
      setRemainingSeconds(autoHideSeconds);
      
      // Countdown timer
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-hide timer
      timerRef.current = setTimeout(() => {
        setIsRevealed(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }, autoHideSeconds * 1000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
  }, [isRevealed, autoHideSeconds]);

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
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  };

  // Prevent copy/paste/select for sensitive data
  const handlePreventCopy = (e: React.ClipboardEvent | React.MouseEvent) => {
    if (isRevealed) {
      e.preventDefault();
    }
  };

  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <span 
      className={cn("inline-flex items-center gap-1.5 group select-none", className)}
      onCopy={handlePreventCopy}
      onCut={handlePreventCopy}
      onContextMenu={handlePreventCopy}
    >
      <span className={cn(
        "transition-all duration-200",
        isRevealed ? "text-foreground" : "text-muted-foreground font-mono"
      )}>
        {isRevealed ? value : maskedValue}
      </span>
      {isRevealed && remainingSeconds > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs text-warning">
          <Timer className="h-3 w-3" />
          {remainingSeconds}s
        </span>
      )}
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
          title={isRevealed ? 'Hide' : 'Reveal (logged, auto-hides in 60s)'}
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