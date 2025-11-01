'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentSession, logout } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

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
    <header className="mb-4 sm:mb-6 border-b border-gray-200 dark:border-gray-700 pb-3 sm:pb-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/mv" className="text-xl sm:text-2xl font-bold text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 transition-colors">
            CSMS
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Link 
              href="/mv" 
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/mv' 
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Master View
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm w-full sm:w-auto justify-between sm:justify-end">
          {username && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <span className="hidden sm:inline text-gray-500 dark:text-gray-400">Signed in as</span>
              <span className="font-medium truncate max-w-[200px]">{username}</span>
              <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300">
                {role}
              </span>
            </div>
          )}
          <ThemeToggle />
          <button
            className="btn-outline text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 flex-shrink-0"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}


