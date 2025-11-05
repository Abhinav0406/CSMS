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
  // Read optional variant option values (?o1=Color&o2=Size&o3=...)
  let o1 = '';
  let o2 = '';
  let o3 = '';
  try {
    const u = new URL(_req.url);
    o1 = (u.searchParams.get('o1') || '').trim();
    o2 = (u.searchParams.get('o2') || '').trim();
    o3 = (u.searchParams.get('o3') || '').trim();
  } catch {}
  const url = `${STORE_ORIGIN}/products/${encodeURIComponent(handle)}.js`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } }); // 5 min cache
    if (!res.ok) {
      return NextResponse.json({ error: `fetch failed ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    const images: string[] = Array.isArray(data?.images) ? data.images : [];
    // Try to resolve variant-specific image when options provided
    let variantImageUrl: string | null = null;
    const hasOptions = !!(o1 || o2 || o3);
    if (hasOptions && Array.isArray(data?.variants)) {
      const matchInsensitive = (a: string | null | undefined, b: string) => {
        const av = (a || '').trim().toLowerCase();
        const bv = (b || '').trim().toLowerCase();
        return av === bv && bv !== '';
      };
      const matched = data.variants.find((v: any) => {
        const ok1 = o1 ? matchInsensitive(v?.option1, o1) : true;
        const ok2 = o2 ? matchInsensitive(v?.option2, o2) : true;
        const ok3 = o3 ? matchInsensitive(v?.option3, o3) : true;
        return ok1 && ok2 && ok3;
      });
      if (matched) {
        const fi = matched?.featured_image;
        const src = typeof fi === 'string' ? fi : (fi?.src as string | undefined);
        if (src) variantImageUrl = normalizeUrl(src);
      }
    }
    if (!images.length) {
      return NextResponse.json({ handle, firstImageUrl: variantImageUrl, images: [] });
    }
    const normalized = images.map(normalizeUrl);
    const firstImageUrl = variantImageUrl || normalized[0] || null;
    return NextResponse.json({ handle, firstImageUrl, images: normalized });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 });
  }
}





