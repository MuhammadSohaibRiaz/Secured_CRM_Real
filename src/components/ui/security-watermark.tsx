import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SecurityWatermarkProps {
  opacity?: number;
  className?: string;
}

export function SecurityWatermark({ opacity = 0.03, className }: SecurityWatermarkProps) {
  const { authUser } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clientIp, setClientIp] = useState<string>('');

  // Fetch client IP on mount
  useEffect(() => {
    const fetchClientIp = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-client-ip');
        if (!error && data?.ip) {
          setClientIp(data.ip);
        }
      } catch (err) {
        console.error('Failed to fetch client IP:', err);
      }
    };

    fetchClientIp();
  }, []);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!authUser) return null;

  // Build watermark text with IP if available
  const watermarkParts = [
    authUser.fullName,
    authUser.email,
    currentTime.toLocaleString(),
  ];
  
  if (clientIp) {
    watermarkParts.push(`IP: ${clientIp}`);
  }

  const watermarkText = watermarkParts.join(' • ');

  return (
    <div 
      className={`fixed inset-0 pointer-events-none z-[9999] overflow-hidden ${className}`}
      style={{ 
        opacity,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      aria-hidden="true"
    >
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 100px,
            transparent 100px,
            transparent 200px
          )`,
        }}
      >
        {/* Generate watermark pattern */}
        <div className="w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4">
          {Array.from({ length: 20 }).map((_, rowIndex) => (
            <div 
              key={rowIndex} 
              className="flex whitespace-nowrap"
              style={{ 
                transform: `translateX(${rowIndex % 2 === 0 ? 0 : -150}px) rotate(-15deg)`,
                marginBottom: '80px',
              }}
            >
              {Array.from({ length: 10 }).map((_, colIndex) => (
                <span 
                  key={colIndex}
                  className="text-foreground text-xs font-medium mx-16 inline-block"
                  style={{ 
                    letterSpacing: '0.05em',
                  }}
                >
                  {watermarkText}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
