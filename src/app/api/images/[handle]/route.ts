import { NextResponse } from 'next/server';

const STORE_ORIGIN = 'https://pearlsbymangatrai.com';

function normalizeUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${STORE_ORIGIN}${url}`;
  return url;
}

export async function GET(
  _req: Request,
  { params }: { params: { handle: string } }
) {
  const handle = params.handle;
  if (!handle) return NextResponse.json({ error: 'missing handle' }, { status: 400 });
  const url = `${STORE_ORIGIN}/products/${encodeURIComponent(handle)}.js`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } }); // 5 min cache
    if (!res.ok) {
      return NextResponse.json({ error: `fetch failed ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    const images: string[] = Array.isArray(data?.images) ? data.images : [];
    if (!images.length) {
      return NextResponse.json({ handle, firstImageUrl: null, images: [] });
    }
    const normalized = images.map(normalizeUrl);
    const firstImageUrl = normalized[0] || null;
    return NextResponse.json({ handle, firstImageUrl, images: normalized });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 });
  }
}



