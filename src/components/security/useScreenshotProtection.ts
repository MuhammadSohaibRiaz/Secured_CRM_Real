import { useEffect, useCallback, useRef } from 'react';

interface ScreenshotAttempt {
  key: string;
  timestamp: Date;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

interface UseScreenshotProtectionOptions {
  onAttempt: (attempt: ScreenshotAttempt) => void;
  enabled?: boolean;
}

// Screenshot-related key combinations
const SCREENSHOT_KEYS = [
  { key: 'PrintScreen', ctrl: false, alt: false, shift: false, meta: false },
  { key: 'PrintScreen', ctrl: false, alt: true, shift: false, meta: false }, // Alt+PrintScreen
  { key: 's', ctrl: true, alt: false, shift: true, meta: false }, // Ctrl+Shift+S (Windows Snip)
  { key: 'S', ctrl: true, alt: false, shift: true, meta: false },
  { key: '3', ctrl: false, alt: false, shift: true, meta: true }, // Cmd+Shift+3 (macOS)
  { key: '4', ctrl: false, alt: false, shift: true, meta: true }, // Cmd+Shift+4 (macOS)
  { key: '5', ctrl: false, alt: false, shift: true, meta: true }, // Cmd+Shift+5 (macOS)
];

export function useScreenshotProtection({ onAttempt, enabled = true }: UseScreenshotProtectionOptions) {
  const lastAttemptRef = useRef<number>(0);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Debounce - ignore if less than 500ms since last attempt
    const now = Date.now();
    if (now - lastAttemptRef.current < 500) return;

    const isScreenshotKey = SCREENSHOT_KEYS.some(combo => {
      const keyMatch = event.key === combo.key || event.code === combo.key;
      const ctrlMatch = event.ctrlKey === combo.ctrl;
      const altMatch = event.altKey === combo.alt;
      const shiftMatch = event.shiftKey === combo.shift;
      const metaMatch = event.metaKey === combo.meta;
      
      return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
    });

    // Also detect PrintScreen by itself (any modifier combination)
    const isPrintScreen = event.key === 'PrintScreen' || event.code === 'PrintScreen';

    if (isScreenshotKey || isPrintScreen) {
      lastAttemptRef.current = now;
      
      // Prevent default behavior (won't always work but worth trying)
      event.preventDefault();
      event.stopPropagation();

      onAttempt({
        key: event.key || event.code,
        timestamp: new Date(),
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      });
    }
  }, [enabled, onAttempt]);

  useEffect(() => {
    if (!enabled) return;

    // Listen on both keydown and keyup for PrintScreen
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
    };
  }, [enabled, handleKeyDown]);
}
