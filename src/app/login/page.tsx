'use client';

import { FormEvent, useState } from 'react';
import { login } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { user, error } = await login(email.trim(), password);
    if (!user) { setError(error || 'Invalid credentials'); return; }
    router.replace('/mv');
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Sign in to CSMS</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Use your Supabase email and password.</p>
      </div>
      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        {error && <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" required />
        </div>
        <button className="btn-primary w-full" type="submit">Sign in</button>
        <div className="text-xs text-gray-500 dark:text-gray-400">Role comes from user app_metadata.role (Edit/View).</div>
      </form>
    </div>
  );
}


