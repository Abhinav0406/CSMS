// Centralized image cache to avoid repeated API calls
const CACHE_KEY = 'csms_image_cache_v2';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ImageCacheEntry {
  key: string; // handle|o1|o2|o3
  firstImageUrl: string | null;
  images: string[];
  timestamp: number;
}

interface ImageCache { [key: string]: ImageCacheEntry }

// In-memory cache
const memoryCache = new Map<string, ImageCacheEntry>();

function buildKey(handle: string, o1?: string | null, o2?: string | null, o3?: string | null): string {
  const a = (handle || '').trim();
  const b = (o1 || '').trim().toLowerCase();
  const c = (o2 || '').trim().toLowerCase();
  const d = (o3 || '').trim().toLowerCase();
  return `${a}|${b}|${c}|${d}`;
}

// Load from localStorage
function loadCache(): ImageCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cache = JSON.parse(raw) as ImageCache;
      const now = Date.now();
      // Clean expired entries
      const valid: ImageCache = {};
      for (const [handle, entry] of Object.entries(cache)) {
        if (now - entry.timestamp < CACHE_EXPIRY_MS) {
          valid[handle] = entry;
          memoryCache.set(handle, entry);
        }
      }
      // Update localStorage with cleaned cache
      if (Object.keys(valid).length !== Object.keys(cache).length) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(valid));
      }
      return valid;
    }
  } catch {}
  return {};
}

// Save to localStorage
function saveCache(key: string, entry: ImageCacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const cache = loadCache();
    cache[key] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    memoryCache.set(key, entry);
  } catch {}
}

// Get cached image URL
export function getCachedImageUrl(handle: string, o1?: string | null, o2?: string | null, o3?: string | null): string | null | undefined {
  const key = buildKey(handle, o1, o2, o3);
  // Check memory cache first
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    const now = Date.now();
    if (now - memEntry.timestamp < CACHE_EXPIRY_MS) {
      return memEntry.firstImageUrl;
    }
    // Expired, remove from memory
    memoryCache.delete(key);
  }
  
  // Check localStorage
  const cache = loadCache();
  const entry = cache[key];
  if (entry) {
    memoryCache.set(key, entry);
    return entry.firstImageUrl;
  }
  
  return undefined; // Not cached
}

// Fetch and cache image URL
export async function fetchAndCacheImageUrl(handle: string, o1?: string | null, o2?: string | null, o3?: string | null): Promise<string | null> {
  // Check cache first
  const cached = getCachedImageUrl(handle, o1, o2, o3);
  if (cached !== undefined) {
    return cached;
  }
  
  // Make API call
  try {
    const params = new URLSearchParams();
    if (o1) params.set('o1', o1);
    if (o2) params.set('o2', o2);
    if (o3) params.set('o3', o3);
    const qs = params.toString();
    const res = await fetch(`/api/images/${encodeURIComponent(handle)}${qs ? `?${qs}` : ''}`);
    if (res.ok) {
      const data = await res.json();
      const key = buildKey(handle, o1, o2, o3);
      const entry: ImageCacheEntry = {
        key,
        firstImageUrl: data.firstImageUrl || null,
        images: data.images || [],
        timestamp: Date.now(),
      };
      saveCache(key, entry);
      return entry.firstImageUrl;
    }
  } catch (e) {
    // Cache null result to avoid repeated failed calls
    const key = buildKey(handle, o1, o2, o3);
    const entry: ImageCacheEntry = {
      key,
      firstImageUrl: null,
      images: [],
      timestamp: Date.now(),
    };
    saveCache(key, entry);
  }
  
  return null;
}

// Preload images for multiple handles
export async function preloadImages(handles: string[]): Promise<void> {
  const uncached = handles.filter(h => {
    const cached = getCachedImageUrl(h);
    return cached === undefined;
  });
  
  if (uncached.length === 0) return;
  
  // Fetch in batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(handle => fetchAndCacheImageUrl(handle)));
  }
}

// Initialize cache on load
if (typeof window !== 'undefined') {
  loadCache();
}

