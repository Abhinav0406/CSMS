import { supabase } from '@/lib/supabaseClient';

export type UserRole = 'Edit' | 'View';

export interface AuthUser {
  email: string;
  role: UserRole;
}

const SESSION_KEY = 'csms_session_v1';

export async function login(email: string, password: string): Promise<{ user: AuthUser | null; error?: string }> {
  if (!supabase) return { user: null, error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { user: null, error: error?.message || 'Invalid credentials' };
  const role = (data.user.app_metadata?.role as UserRole) || 'View';
  const user: AuthUser = { email: data.user.email || email, role };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
  return { user };
}

export async function logout(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

export async function getCurrentSession(): Promise<AuthUser | null> {
  if (!supabase) return getCachedSession();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return getCachedSession();
  const role = (u.app_metadata?.role as UserRole) || 'View';
  const session: AuthUser = { email: u.email || '', role };
  if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getCachedSession(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function requireRole(role: UserRole, user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (role === 'View') return true;
  return user.role === 'Edit';
}


