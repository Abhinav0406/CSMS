'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentSession, logout } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InstallButton } from '@/components/InstallButton';

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    (async () => {
      const session = await getCurrentSession();
      if (session) {
        // Extract just the name part before @ from email
        const email = session.email;
        const displayName = email?.split('@')[0] || email;
        setUsername(displayName);
        setRole(session.role);
      }
    })();
  }, [pathname]);

  return (
    <header className="mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/mv" className="flex items-center hover:opacity-80 transition-opacity">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-brand-700 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 transition-colors tracking-wider px-2">
              CSMS
            </span>
          </Link>
          <nav className="hidden sm:flex items-center">
            <Link 
              href="/mv" 
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                pathname === '/mv' 
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Master View
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          {username && (
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="font-medium truncate max-w-[120px] sm:max-w-[150px]">{username}</span>
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-medium text-gray-700 dark:text-gray-300">
                {role}
              </span>
            </div>
          )}
          <ThemeToggle />
          <InstallButton />
          <button
            className="btn-outline text-xs px-2 py-1 flex-shrink-0"
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


