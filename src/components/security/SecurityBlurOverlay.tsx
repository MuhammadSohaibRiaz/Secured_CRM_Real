import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SecurityBlurOverlayProps {
  isVisible: boolean;
  reason: 'screenshot' | 'focus_lost' | 'dev_tools' | 'violation';
  onAcknowledge?: () => void;
  violationCount?: number;
}

export function SecurityBlurOverlay({ 
  isVisible, 
  reason, 
  onAcknowledge,
  violationCount = 0 
}: SecurityBlurOverlayProps) {
  if (!isVisible) return null;

  const messages = {
    screenshot: {
      title: 'Screenshot Attempt Detected',
      description: 'Screenshots are not allowed. This attempt has been logged.',
      icon: EyeOff,
      severity: 'high' as const,
    },
    focus_lost: {
      title: 'Screen Hidden',
      description: 'The screen is blurred while the window is not in focus.',
      icon: Eye,
      severity: 'low' as const,
    },
    dev_tools: {
      title: 'Developer Tools Detected',
      description: 'Developer tools are not allowed. This has been logged.',
      icon: AlertTriangle,
      severity: 'high' as const,
    },
    violation: {
      title: 'Security Violation',
      description: 'Multiple security violations detected. Your session may be terminated.',
      icon: AlertTriangle,
      severity: 'critical' as const,
    },
  };

  const { title, description, icon: Icon, severity } = messages[reason];

  const severityStyles = {
    low: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    high: 'bg-destructive/10 border-destructive/30 text-destructive',
    critical: 'bg-destructive/20 border-destructive/50 text-destructive',
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center transition-all duration-300"
      style={{
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      }}
    >
      <div className={`max-w-md p-6 rounded-lg border-2 ${severityStyles[severity]} bg-background/90`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-full ${severity === 'critical' ? 'bg-destructive/20' : 'bg-current/10'}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {violationCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Violations: {violationCount}
              </p>
            )}
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">
          {description}
        </p>

        {reason === 'focus_lost' && (
          <p className="text-xs text-muted-foreground/70">
            Click anywhere or return focus to the window to continue.
          </p>
        )}

        {(reason === 'screenshot' || reason === 'dev_tools' || reason === 'violation') && onAcknowledge && (
          <Button 
            onClick={onAcknowledge}
            variant={severity === 'critical' ? 'destructive' : 'outline'}
            className="w-full mt-2"
          >
            I Understand
          </Button>
        )}

        {severity === 'critical' && (
          <p className="text-xs text-destructive mt-3 text-center">
            ⚠️ Continued violations will result in automatic session termination
          </p>
        )}
      </div>
    </div>
  );
}
