import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP from various headers (in order of preference)
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    
    // x-forwarded-for can contain multiple IPs, take the first one (original client)
    let clientIp = 'Unknown';
    
    if (forwardedFor) {
      clientIp = forwardedFor.split(',')[0].trim();
    } else if (realIp) {
      clientIp = realIp;
    } else if (cfConnectingIp) {
      clientIp = cfConnectingIp;
    }

    // Mask partial IP for privacy (show first 2 octets only for IPv4)
    let maskedIp = clientIp;
    if (clientIp !== 'Unknown' && clientIp.includes('.')) {
      const octets = clientIp.split('.');
      if (octets.length === 4) {
        maskedIp = `${octets[0]}.${octets[1]}.*.*`;
      }
    }

    console.log(`Client IP captured: ${clientIp} (masked: ${maskedIp})`);

    return new Response(
      JSON.stringify({ 
        ip: maskedIp,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error getting client IP:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ip: 'Unknown', error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
