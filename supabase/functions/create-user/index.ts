import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { email, password, fullName, role, adminSecret } = await req.json();

    // Validate admin secret - this is a simple bootstrap mechanism
    // In production, you would use a more secure method
    const expectedSecret = Deno.env.get('ADMIN_BOOTSTRAP_SECRET');
    
    // Check if this is a bootstrap request (first admin) or admin creating agents
    const authHeader = req.headers.get('Authorization');
    let isBootstrap = false;
    let requestingAdminId: string | null = null;

    if (adminSecret && expectedSecret && adminSecret === expectedSecret) {
      // Bootstrap mode - creating first admin
      isBootstrap = true;
      console.log('Bootstrap mode: Creating first admin user');
    } else if (authHeader) {
      // Normal mode - admin creating agents
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if requesting user is an admin
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!roleData || roleData.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Only admins can create users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      requestingAdminId = user.id;
      console.log(`Admin ${user.id} creating new user`);
    } else {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate inputs
    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, fullName, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['admin', 'agent'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be "admin" or "agent"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow creating admins during bootstrap
    if (role === 'admin' && !isBootstrap) {
      return new Response(
        JSON.stringify({ error: 'Only the first admin can be created via bootstrap' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the user in auth
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since admin created
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user.id;
    console.log(`Created auth user: ${userId}`);

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        full_name: fullName,
        email: email,
        is_active: true,
        created_by: requestingAdminId,
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: 'Failed to create profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: role,
      });

    if (roleError) {
      console.error('Error creating role:', roleError);
      // Rollback
      await supabaseAdmin.from('profiles').delete().eq('user_id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: 'Failed to assign role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully created ${role}: ${email}`);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
          fullName: fullName,
          role: role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
