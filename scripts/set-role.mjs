import { createClient } from '@supabase/supabase-js';

// Required environment variables (do NOT expose in frontend):
// SUPABASE_URL=https://PROJECT_REF.supabase.co
// SUPABASE_SERVICE_ROLE=your_service_role_key
// TARGET_USER_ID=the-user-uuid
// TARGET_ROLE=Edit|View (defaults to View)

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  const userId = process.env.TARGET_USER_ID;
  const role = (process.env.TARGET_ROLE || 'View').trim();

  if (!url || !serviceRole || !userId) {
    console.error('Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE, TARGET_USER_ID. Optional: TARGET_ROLE=Edit|View');
    process.exit(1);
  }
  if (role !== 'Edit' && role !== 'View') {
    console.error('TARGET_ROLE must be "Edit" or "View"');
    process.exit(1);
  }

  const supa = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });

  if (error) {
    console.error('Failed to update role:', error);
    process.exit(1);
  }
  console.log('Updated user:', data.user.id);
  console.log('New app_metadata:', data.user.app_metadata);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


