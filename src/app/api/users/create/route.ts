import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Secure endpoint to create a user without email confirmation and set role
// Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE

export async function POST(request: Request) {
  const { email, password, role } = await request.json().catch(() => ({}));
  if (!email || !password || (role !== 'Edit' && role !== 'View')) {
    return NextResponse.json({ error: 'email, password and role (Edit|View) are required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    return NextResponse.json({ error: 'Server misconfigured: missing Supabase envs' }, { status: 500 });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // bypass confirmation
    app_metadata: { role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, userId: data.user.id });
}


