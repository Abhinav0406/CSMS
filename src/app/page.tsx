'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const session = await getCurrentSession();
      if (session) router.replace('/mv');
      else router.replace('/login');
    })();
  }, [router]);

  return null;
}


