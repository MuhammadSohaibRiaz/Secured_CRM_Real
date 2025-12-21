import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Loader2, Timer, AlertCircle } from 'lucide-react';
import { Button } from './button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MaskedFieldProps {
  value: string | null | undefined; // This is the pre-masked value from server
  type: 'email' | 'phone';
  entityId: string;
  entityType?: string;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
  autoHideSeconds?: number; // Time-limited exposure (default: 60)
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
  const [isLoading, setIsLoading] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(autoHideSeconds);
  const [rateLimited, setRateLimited] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Handle auto-hide timer when revealed
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
        setRevealedValue(null);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }, autoHideSeconds * 1000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
  }, [isRevealed, autoHideSeconds]);

  const handleReveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!value) return;
    
    if (!isRevealed) {
      setIsLoading(true);
      
      try {
        // Call server-side function to reveal PII (also logs the action)
        const { data, error } = await supabase.rpc('reveal_lead_pii', {
          _lead_id: entityId,
          _field: type
        });

        if (error) {
          console.error('Failed to reveal:', error);
          
          // Check if it's a rate limit error
          if (error.message?.includes('Rate limit exceeded')) {
            setRateLimited(true);
            toast.error('Rate limit exceeded', {
              description: 'Maximum 20 reveals per hour. Please wait before revealing more data.',
              icon: <AlertCircle className="h-4 w-4" />,
            });
          } else {
            toast.error('Failed to reveal data', {
              description: error.message,
            });
          }
          
          setIsLoading(false);
          return;
        }

        setRateLimited(false);
        setRevealedValue(data);
        setIsRevealed(true);
      } catch (err) {
        console.error('Error revealing field:', err);
      }
      
      setIsLoading(false);
    } else {
      // Hide the revealed value
      setIsRevealed(false);
      setRevealedValue(null);
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
        {isRevealed && revealedValue ? revealedValue : value}
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
            rateLimited && "text-destructive opacity-100",
            iconClassName
          )}
          onClick={handleReveal}
          disabled={isLoading || rateLimited}
          title={rateLimited ? 'Rate limit exceeded (20/hour)' : isRevealed ? 'Hide' : 'Reveal (logged, auto-hides in 60s)'}
        >
          {isLoading ? (
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
