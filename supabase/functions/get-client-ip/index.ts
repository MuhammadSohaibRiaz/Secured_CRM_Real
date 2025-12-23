import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  
  // Extract project domain from Supabase URL for allowed origins
  const projectId = supabaseUrl.replace('https://', '').split('.')[0];
  
  // Allow requests from the Lovable preview and production domains
  const allowedOrigins = [
    `https://${projectId}.lovableproject.com`,
    `https://${projectId}.lovable.app`,
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  
  const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/:\d+$/, ''))) || 
                    origin.includes('lovableproject.com') || 
                    origin.includes('lovable.app');
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Unauthorized request - no auth header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client to verify the user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('Invalid token:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client IP from various headers (in order of preference)
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    
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

    console.log(`Client IP captured for user ${user.id}: ${clientIp} (masked: ${maskedIp})`);

    // Log the IP query to activity_logs for audit trail
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action: 'ip_address_queried',
      entity_type: 'security',
      details: { masked_ip: maskedIp, timestamp: new Date().toISOString() }
    });

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