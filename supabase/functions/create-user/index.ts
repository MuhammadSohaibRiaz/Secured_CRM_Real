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

    const body = await req.json();
    const { action } = body;

    // Handle DELETE action
    if (action === 'delete') {
      return await handleDeleteUser(req, supabaseAdmin, body);
    }

    // Handle CREATE action (default)
    return await handleCreateUser(req, supabaseAdmin, body);
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function verifyAdmin(req: Request, supabaseAdmin: any): Promise<{ isAdmin: boolean; adminId: string | null; error?: Response }> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    return {
      isAdmin: false,
      adminId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) {
    console.error('Auth error:', authError);
    return {
      isAdmin: false,
      adminId: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!roleData || roleData.role !== 'admin') {
    return {
      isAdmin: false,
      adminId: null,
      error: new Response(
        JSON.stringify({ error: 'Only admins can perform this action' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  return { isAdmin: true, adminId: user.id };
}

async function handleDeleteUser(req: Request, supabaseAdmin: any, body: any): Promise<Response> {
  const { userId } = body;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: userId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify admin
  const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin);
  if (!isAdmin || error) {
    return error!;
  }

  // Prevent admin from deleting themselves
  if (userId === adminId) {
    return new Response(
      JSON.stringify({ error: 'Cannot delete your own account' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if target user is an agent (only allow deleting agents)
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!roleData || roleData.role !== 'agent') {
    return new Response(
      JSON.stringify({ error: 'Can only delete agent accounts' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Admin ${adminId} deleting agent ${userId}`);

  // Delete in order: role -> profile -> auth user
  const { error: roleError } = await supabaseAdmin
    .from('user_roles')
    .delete()
    .eq('user_id', userId);

  if (roleError) {
    console.error('Error deleting role:', roleError);
    return new Response(
      JSON.stringify({ error: 'Failed to delete user role' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('user_id', userId);

  if (profileError) {
    console.error('Error deleting profile:', profileError);
    return new Response(
      JSON.stringify({ error: 'Failed to delete user profile' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authError) {
    console.error('Error deleting auth user:', authError);
    return new Response(
      JSON.stringify({ error: 'Failed to delete auth user' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Successfully deleted agent ${userId}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleCreateUser(req: Request, supabaseAdmin: any, body: any): Promise<Response> {
  const { email, password, fullName, role, adminSecret } = body;

  // Validate admin secret - this is a simple bootstrap mechanism
  const expectedSecret = Deno.env.get('ADMIN_BOOTSTRAP_SECRET');
  
  let isBootstrap = false;
  let requestingAdminId: string | null = null;

  if (adminSecret && expectedSecret && adminSecret === expectedSecret) {
    // Bootstrap mode - creating first admin
    isBootstrap = true;
    console.log('Bootstrap mode: Creating first admin user');
  } else {
    // Normal mode - admin creating agents
    const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin);
    if (!isAdmin || error) {
      return error!;
    }
    requestingAdminId = adminId;
    console.log(`Admin ${adminId} creating new user`);
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
    email_confirm: true,
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
}
