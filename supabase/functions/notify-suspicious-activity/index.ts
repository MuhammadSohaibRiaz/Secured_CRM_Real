import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SuspiciousActivityRequest {
  agentId: string;
  agentName: string;
  agentEmail: string;
  revealCount: number;
  timeWindowMinutes: number;
  recentActions: Array<{
    action: string;
    timestamp: string;
    details?: Record<string, unknown>;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Resend API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!adminEmail) {
      console.error('ADMIN_NOTIFICATION_EMAIL not configured');
      return new Response(JSON.stringify({ error: 'Admin email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: isAdmin } = await supabaseClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      agentId, 
      agentName, 
      agentEmail, 
      revealCount, 
      timeWindowMinutes,
      recentActions 
    }: SuspiciousActivityRequest = await req.json();

    const actionsList = recentActions
      .slice(0, 10)
      .map(a => `<li>${a.action} at ${new Date(a.timestamp).toLocaleString()}</li>`)
      .join('');

    // Send email using Resend API directly
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "CRM Security <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `⚠️ ALERT: Suspicious Activity Detected - ${agentName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🚨 Security Alert</h1>
            </div>
            
            <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">Suspicious Activity Detected</h2>
              
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; color: #991b1b;">
                  <strong>${agentName}</strong> has revealed sensitive data <strong>${revealCount} times</strong> 
                  in the last <strong>${timeWindowMinutes} minutes</strong>.
                </p>
              </div>
              
              <h3 style="color: #374151;">Agent Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Name:</td>
                  <td style="padding: 8px 0; color: #1f2937;"><strong>${agentName}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Email:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${agentEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Agent ID:</td>
                  <td style="padding: 8px 0; color: #1f2937; font-family: monospace; font-size: 12px;">${agentId}</td>
                </tr>
              </table>
              
              <h3 style="color: #374151;">Recent Actions</h3>
              <ul style="color: #4b5563; padding-left: 20px;">
                ${actionsList}
              </ul>
              
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  <strong>Recommended Actions:</strong>
                </p>
                <ul style="color: #4b5563; font-size: 14px;">
                  <li>Review the agent's activity in the Admin Dashboard</li>
                  <li>Consider temporarily disabling the agent's access</li>
                  <li>Contact the agent to verify their activity</li>
                </ul>
              </div>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
              This is an automated security alert from your CRM system.
            </p>
          </div>
        `,
      }),
    });

    const emailResult = await emailResponse.json();
    
    if (!emailResponse.ok) {
      console.error("Failed to send email:", emailResult);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: emailResult }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("Suspicious activity notification sent:", emailResult);

    // Log the alert in activity_logs
    await supabaseClient.from('activity_logs').insert({
      user_id: user.id,
      action: 'security_alert_sent',
      entity_type: 'agent',
      entity_id: agentId,
      details: {
        alert_type: 'suspicious_activity',
        agent_name: agentName,
        reveal_count: revealCount,
        time_window_minutes: timeWindowMinutes,
        notification_sent_to: adminEmail,
      }
    });

    return new Response(JSON.stringify({ success: true, emailId: emailResult.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error("Error in notify-suspicious-activity function:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);