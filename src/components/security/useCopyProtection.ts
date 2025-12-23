import { useEffect, useCallback } from 'react';

interface CopyAttempt {
  type: 'copy' | 'cut' | 'paste' | 'select_all' | 'right_click';
  timestamp: Date;
}

interface UseCopyProtectionOptions {
  onAttempt: (attempt: CopyAttempt) => void;
  enabled?: boolean;
  allowInInputs?: boolean; // Allow copy/paste in input fields
}

export function useCopyProtection({
  onAttempt,
  enabled = true,
  allowInInputs = true,
}: UseCopyProtectionOptions) {
  
  const isInputElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  };

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Allow in input fields if configured
    if (allowInInputs && isInputElement(event.target)) return;

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    // Ctrl+C / Cmd+C (Copy)
    if (isCtrlOrCmd && (event.key === 'c' || event.key === 'C')) {
      event.preventDefault();
      event.stopPropagation();
      onAttempt({ type: 'copy', timestamp: new Date() });
      return;
    }

    // Ctrl+X / Cmd+X (Cut)
    if (isCtrlOrCmd && (event.key === 'x' || event.key === 'X')) {
      event.preventDefault();
      event.stopPropagation();
      onAttempt({ type: 'cut', timestamp: new Date() });
      return;
    }

    // Ctrl+V / Cmd+V (Paste) - Block on sensitive elements
    if (isCtrlOrCmd && (event.key === 'v' || event.key === 'V')) {
      if (!isInputElement(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        onAttempt({ type: 'paste', timestamp: new Date() });
      }
      return;
    }

    // Ctrl+A / Cmd+A (Select All)
    if (isCtrlOrCmd && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      event.stopPropagation();
      onAttempt({ type: 'select_all', timestamp: new Date() });
      return;
    }
  }, [enabled, allowInInputs, onAttempt]);

  // Handle right-click context menu
  const handleContextMenu = useCallback((event: MouseEvent) => {
    if (!enabled) return;

    // Allow in input fields if configured
    if (allowInInputs && isInputElement(event.target)) return;

    event.preventDefault();
    onAttempt({ type: 'right_click', timestamp: new Date() });
  }, [enabled, allowInInputs, onAttempt]);

  // Handle copy event
  const handleCopy = useCallback((event: ClipboardEvent) => {
    if (!enabled) return;
    if (allowInInputs && isInputElement(event.target)) return;

    event.preventDefault();
    onAttempt({ type: 'copy', timestamp: new Date() });
  }, [enabled, allowInInputs, onAttempt]);

  // Handle cut event
  const handleCut = useCallback((event: ClipboardEvent) => {
    if (!enabled) return;
    if (allowInInputs && isInputElement(event.target)) return;

    event.preventDefault();
    onAttempt({ type: 'cut', timestamp: new Date() });
  }, [enabled, allowInInputs, onAttempt]);

  // Disable text selection via CSS
  useEffect(() => {
    if (!enabled) return;

    // Add CSS to disable selection on body
    const style = document.createElement('style');
    style.id = 'security-no-select';
    style.textContent = `
      body:not(input):not(textarea):not([contenteditable="true"]) {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById('security-no-select');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCut, true);
    };
  }, [enabled, handleKeyDown, handleContextMenu, handleCopy, handleCut]);
}
