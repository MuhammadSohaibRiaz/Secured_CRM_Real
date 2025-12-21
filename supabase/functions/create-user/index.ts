import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dynamic CORS - validates origin against allowed list
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  
  // If ALLOWED_ORIGINS is not configured, allow all (dev mode)
  // In production, set ALLOWED_ORIGINS env variable
  if (ALLOWED_ORIGINS.length === 0) {
    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }
  
  // Validate origin against whitelist
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  
  // Unknown origin - return restrictive headers
  return {
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Generic error messages to prevent information leakage
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Access denied',
  BAD_REQUEST: 'Invalid request',
  INTERNAL_ERROR: 'Operation failed. Please try again.',
  VALIDATION_ERROR: 'Validation failed',
} as const;

// Email validation function
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
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
      return await handleDeleteUser(req, supabaseAdmin, body, corsHeaders);
    }

    // Handle EDIT action
    if (action === 'edit') {
      return await handleEditUser(req, supabaseAdmin, body, corsHeaders);
    }

    // Handle RESET PASSWORD action
    if (action === 'reset-password') {
      return await handleResetPassword(req, supabaseAdmin, body, corsHeaders);
    }

    // Handle CREATE action (default)
    return await handleCreateUser(req, supabaseAdmin, body, corsHeaders);
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function verifyAdmin(req: Request, supabaseAdmin: any, corsHeaders: Record<string, string>): Promise<{ isAdmin: boolean; adminId: string | null; error?: Response }> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    return {
      isAdmin: false,
      adminId: null,
      error: new Response(
        JSON.stringify({ error: ERROR_MESSAGES.UNAUTHORIZED }),
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
        JSON.stringify({ error: ERROR_MESSAGES.UNAUTHORIZED }),
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
        JSON.stringify({ error: ERROR_MESSAGES.FORBIDDEN }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  return { isAdmin: true, adminId: user.id };
}

async function handleEditUser(req: Request, supabaseAdmin: any, body: any, corsHeaders: Record<string, string>): Promise<Response> {
  const { userId, fullName, email } = body;

  if (!userId || !fullName || !email) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.BAD_REQUEST }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate input lengths
  if (fullName.length > 100 || email.length > 255) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.VALIDATION_ERROR }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate email format
  if (!isValidEmail(email.trim())) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.VALIDATION_ERROR }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify admin
  const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin, corsHeaders);
  if (!isAdmin || error) {
    return error!;
  }

  // Check if target user is an agent (only allow editing agents)
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!roleData || roleData.role !== 'agent') {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.FORBIDDEN }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Admin ${adminId} editing agent ${userId}`);

  // Update profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: fullName.trim(), email: email.trim() })
    .eq('user_id', userId);

  if (profileError) {
    console.error('Error updating profile:', profileError);
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update auth user email
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: email.trim(),
  });

  if (authError) {
    console.error('Error updating auth user:', authError);
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Successfully updated agent ${userId}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleResetPassword(req: Request, supabaseAdmin: any, body: any, corsHeaders: Record<string, string>): Promise<Response> {
  const { userId, newPassword } = body;

  if (!userId || !newPassword) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.BAD_REQUEST }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate password length
  if (newPassword.length < 6) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.VALIDATION_ERROR }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify admin
  const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin, corsHeaders);
  if (!isAdmin || error) {
    return error!;
  }

  // Check if target user is an agent (only allow resetting agent passwords)
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!roleData || roleData.role !== 'agent') {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.FORBIDDEN }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Admin ${adminId} resetting password for agent ${userId}`);

  // Update the user's password
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (authError) {
    console.error('Error resetting password:', authError);
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Successfully reset password for agent ${userId}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDeleteUser(req: Request, supabaseAdmin: any, body: any, corsHeaders: Record<string, string>): Promise<Response> {
  const { userId } = body;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.BAD_REQUEST }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify admin
  const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin, corsHeaders);
  if (!isAdmin || error) {
    return error!;
  }

  // Prevent admin from deleting themselves
  if (userId === adminId) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.BAD_REQUEST }),
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
      JSON.stringify({ error: ERROR_MESSAGES.FORBIDDEN }),
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
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
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
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authError) {
    console.error('Error deleting auth user:', authError);
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Successfully deleted agent ${userId}`);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleCreateUser(req: Request, supabaseAdmin: any, body: any, corsHeaders: Record<string, string>): Promise<Response> {
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
    const { isAdmin, adminId, error } = await verifyAdmin(req, supabaseAdmin, corsHeaders);
    if (!isAdmin || error) {
      return error!;
    }
    requestingAdminId = adminId;
    console.log(`Admin ${adminId} creating new user`);
  }

  // Validate inputs
  if (!email || !password || !fullName || !role) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.BAD_REQUEST }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate email format
  if (!isValidEmail(email.trim())) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.VALIDATION_ERROR }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!['admin', 'agent'].includes(role)) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.VALIDATION_ERROR }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Only allow creating admins during bootstrap
  if (role === 'admin' && !isBootstrap) {
    return new Response(
      JSON.stringify({ error: ERROR_MESSAGES.FORBIDDEN }),
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
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
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
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
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
      JSON.stringify({ error: ERROR_MESSAGES.INTERNAL_ERROR }),
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
