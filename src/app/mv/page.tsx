'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth';
import { NavBar } from '@/components/NavBar';
import { ProductTable } from '@/components/ProductTable';

export default function MasterViewPage() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const s = await getCurrentSession();
      if (!s) router.replace('/login');
    })();
  }, [router]);

  return (
    <div className="space-y-4">
      <NavBar />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Master View</h2>
      </div>
      <ProductTable initialProducts={[]} />
      <div className="text-sm text-gray-600">
        Import your Shopify CSV to begin. Only Edit users can import/export.
      </div>
    </div>
  );
}


