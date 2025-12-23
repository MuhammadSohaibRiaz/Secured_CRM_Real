import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useScreenshotProtection } from './useScreenshotProtection';
import { useFocusProtection } from './useFocusProtection';
import { useCopyProtection } from './useCopyProtection';
import { SecurityBlurOverlay } from './SecurityBlurOverlay';
import { toast } from 'sonner';

interface SecurityContextValue {
  violationCount: number;
  isProtectionEnabled: boolean;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

export function useSecurityShield() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurityShield must be used within SecurityShieldProvider');
  }
  return context;
}

interface SecurityShieldProviderProps {
  children: ReactNode;
}

const MAX_VIOLATIONS_BEFORE_LOGOUT = 5;
const VIOLATION_RESET_MINUTES = 30;

type OverlayReason = 'screenshot' | 'focus_lost' | 'dev_tools' | 'violation';

export function SecurityShieldProvider({ children }: SecurityShieldProviderProps) {
  const { authUser, signOut, isAdmin } = useAuth();
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayReason, setOverlayReason] = useState<OverlayReason>('focus_lost');
  const [violationCount, setViolationCount] = useState(0);
  const violationResetTimeout = useRef<NodeJS.Timeout | null>(null);

  // Only enable protection for authenticated non-admin users
  const isProtectionEnabled = !!authUser && !isAdmin;

  // Log security event to database
  const logSecurityEvent = useCallback(async (action: string, details?: Record<string, unknown>) => {
    if (!authUser) return;

    try {
      const logEntry = {
        user_id: authUser.id,
        entity_type: 'security',
        action,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
      };
      await supabase.from('activity_logs').insert([logEntry]);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }, [authUser]);

  // Handle violation and potential force logout
  const handleViolation = useCallback((reason: OverlayReason, action: string, details?: Record<string, unknown>) => {
    if (!isProtectionEnabled) return;

    setViolationCount(prev => {
      const newCount = prev + 1;
      
      // Log the event
      logSecurityEvent(action, { ...details, violationCount: newCount });

      // Show toast warning
      toast.warning(`Security Warning: ${action.replace(/_/g, ' ')}`, {
        description: `Violation ${newCount}/${MAX_VIOLATIONS_BEFORE_LOGOUT}. This activity is being monitored.`,
        duration: 5000,
      });

      // Force logout after max violations
      if (newCount >= MAX_VIOLATIONS_BEFORE_LOGOUT) {
        toast.error('Session Terminated', {
          description: 'Too many security violations. You have been logged out.',
          duration: 10000,
        });
        setTimeout(() => {
          signOut();
        }, 2000);
      }

      return newCount;
    });

    // Reset violation count after timeout
    if (violationResetTimeout.current) {
      clearTimeout(violationResetTimeout.current);
    }
    violationResetTimeout.current = setTimeout(() => {
      setViolationCount(0);
    }, VIOLATION_RESET_MINUTES * 60 * 1000);

    // Show overlay
    setOverlayReason(reason);
    setShowOverlay(true);
  }, [isProtectionEnabled, logSecurityEvent, signOut]);

  // Screenshot protection
  useScreenshotProtection({
    enabled: isProtectionEnabled,
    onAttempt: (attempt) => {
      handleViolation('screenshot', 'screenshot_attempt', {
        key: attempt.key,
        modifiers: {
          ctrl: attempt.ctrlKey,
          alt: attempt.altKey,
          shift: attempt.shiftKey,
          meta: attempt.metaKey,
        },
      });
    },
  });

  // Focus protection
  const { isBlurred, setIsBlurred } = useFocusProtection({
    enabled: isProtectionEnabled,
    onFocusLost: (event) => {
      logSecurityEvent(event.type, { timestamp: event.timestamp.toISOString() });
      
      if (event.type === 'dev_tools_opened') {
        handleViolation('dev_tools', 'dev_tools_opened', {});
      } else {
        setOverlayReason('focus_lost');
        setShowOverlay(true);
      }
    },
    onFocusRestored: () => {
      if (overlayReason === 'focus_lost') {
        setShowOverlay(false);
      }
    },
  });

  // Copy protection
  useCopyProtection({
    enabled: isProtectionEnabled,
    onAttempt: (attempt) => {
      logSecurityEvent(`copy_attempt_blocked`, { type: attempt.type });
      toast.warning('Copy/Paste Blocked', {
        description: 'Copying data is not allowed. This attempt has been logged.',
        duration: 3000,
      });
    },
    allowInInputs: true,
  });

  // Handle overlay acknowledgment
  const handleAcknowledge = useCallback(() => {
    setShowOverlay(false);
    setIsBlurred(false);
  }, [setIsBlurred]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (violationResetTimeout.current) {
        clearTimeout(violationResetTimeout.current);
      }
    };
  }, []);

  // Determine if we should show the overlay
  const shouldShowOverlay = showOverlay || isBlurred;

  return (
    <SecurityContext.Provider value={{ violationCount, isProtectionEnabled }}>
      {children}
      {isProtectionEnabled && (
        <SecurityBlurOverlay
          isVisible={shouldShowOverlay}
          reason={violationCount >= MAX_VIOLATIONS_BEFORE_LOGOUT - 1 ? 'violation' : overlayReason}
          onAcknowledge={overlayReason !== 'focus_lost' ? handleAcknowledge : undefined}
          violationCount={violationCount}
        />
      )}
    </SecurityContext.Provider>
  );
}
