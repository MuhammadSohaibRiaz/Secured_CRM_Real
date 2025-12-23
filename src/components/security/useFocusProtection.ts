import { useState, useEffect, useCallback, useRef } from 'react';

interface FocusEvent {
  type: 'tab_switch' | 'focus_lost' | 'dev_tools_opened' | 'focus_restored';
  timestamp: Date;
}

interface UseFocusProtectionOptions {
  onFocusLost: (event: FocusEvent) => void;
  onFocusRestored?: () => void;
  enabled?: boolean;
  graceDelayMs?: number; // Delay before triggering blur (avoid false positives)
}

export function useFocusProtection({
  onFocusLost,
  onFocusRestored,
  enabled = true,
  graceDelayMs = 500,
}: UseFocusProtectionOptions) {
  const [isBlurred, setIsBlurred] = useState(false);
  const graceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const devToolsCheckRef = useRef<NodeJS.Timeout | null>(null);
  const windowSizeRef = useRef({ width: window.outerWidth, height: window.outerHeight });

  // Clear grace timeout
  const clearGraceTimeout = useCallback(() => {
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
  }, []);

  // Handle visibility change (tab switching)
  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;

    if (document.hidden) {
      // Start grace period
      clearGraceTimeout();
      graceTimeoutRef.current = setTimeout(() => {
        setIsBlurred(true);
        onFocusLost({
          type: 'tab_switch',
          timestamp: new Date(),
        });
      }, graceDelayMs);
    } else {
      clearGraceTimeout();
      setIsBlurred(false);
      onFocusRestored?.();
    }
  }, [enabled, graceDelayMs, onFocusLost, onFocusRestored, clearGraceTimeout]);

  // Handle window blur (minimize, click outside)
  const handleWindowBlur = useCallback(() => {
    if (!enabled) return;

    clearGraceTimeout();
    graceTimeoutRef.current = setTimeout(() => {
      setIsBlurred(true);
      onFocusLost({
        type: 'focus_lost',
        timestamp: new Date(),
      });
    }, graceDelayMs);
  }, [enabled, graceDelayMs, onFocusLost, clearGraceTimeout]);

  // Handle window focus
  const handleWindowFocus = useCallback(() => {
    if (!enabled) return;

    clearGraceTimeout();
    setIsBlurred(false);
    onFocusRestored?.();
  }, [enabled, onFocusRestored, clearGraceTimeout]);

  // Detect dev tools opening (resize detection - not 100% reliable but helps)
  const checkDevTools = useCallback(() => {
    if (!enabled) return;

    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;

    if ((widthThreshold || heightThreshold) && 
        (windowSizeRef.current.width === window.outerWidth && 
         windowSizeRef.current.height === window.outerHeight)) {
      setIsBlurred(true);
      onFocusLost({
        type: 'dev_tools_opened',
        timestamp: new Date(),
      });
    }

    windowSizeRef.current = { width: window.outerWidth, height: window.outerHeight };
  }, [enabled, onFocusLost]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    // Check for dev tools periodically
    devToolsCheckRef.current = setInterval(checkDevTools, 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearGraceTimeout();
      if (devToolsCheckRef.current) {
        clearInterval(devToolsCheckRef.current);
      }
    };
  }, [enabled, handleVisibilityChange, handleWindowBlur, handleWindowFocus, checkDevTools, clearGraceTimeout]);

  return { isBlurred, setIsBlurred };
}
