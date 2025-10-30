'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentSession, logout } from '@/lib/auth';
import { useEffect, useState } from 'react';

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    (async () => {
      const session = await getCurrentSession();
      if (session) {
        setUsername(session.email);
        setRole(session.role);
      }
    })();
  }, [pathname]);

  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/mv" className="text-lg font-semibold text-brand-700">CSMS</Link>
        <nav className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
          <Link href="/mv" className={`px-2 py-1 rounded ${pathname === '/mv' ? 'bg-gray-100' : ''}`}>Master View</Link>
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {username && (
          <span className="text-gray-600">Signed in as <span className="font-medium">{username}</span> ({role})</span>
        )}
        <button
          className="btn-outline"
          onClick={() => {
            logout();
            router.replace('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}


