import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side route to set app_metadata.role for a user.
// Requires env: SUPABASE_SERVICE_ROLE and NEXT_PUBLIC_SUPABASE_URL

export async function POST(request: Request) {
  const { userId, role } = await request.json().catch(() => ({}));

  if (!userId || !role || (role !== 'Edit' && role !== 'View')) {
    return NextResponse.json({ error: 'userId and role (Edit|View) are required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    return NextResponse.json({ error: 'Server is missing Supabase configuration' }, { status: 500 });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, userId: data.user.id, app_metadata: data.user.app_metadata });
}


