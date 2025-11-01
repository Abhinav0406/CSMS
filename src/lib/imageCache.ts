// Centralized image cache to avoid repeated API calls
const CACHE_KEY = 'csms_image_cache_v1';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ImageCacheEntry {
  handle: string;
  firstImageUrl: string | null;
  images: string[];
  timestamp: number;
}

interface ImageCache {
  [handle: string]: ImageCacheEntry;
}

// In-memory cache
const memoryCache = new Map<string, ImageCacheEntry>();

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
function saveCache(handle: string, entry: ImageCacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const cache = loadCache();
    cache[handle] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    memoryCache.set(handle, entry);
  } catch {}
}

// Get cached image URL
export function getCachedImageUrl(handle: string): string | null | undefined {
  // Check memory cache first
  const memEntry = memoryCache.get(handle);
  if (memEntry) {
    const now = Date.now();
    if (now - memEntry.timestamp < CACHE_EXPIRY_MS) {
      return memEntry.firstImageUrl;
    }
    // Expired, remove from memory
    memoryCache.delete(handle);
  }
  
  // Check localStorage
  const cache = loadCache();
  const entry = cache[handle];
  if (entry) {
    memoryCache.set(handle, entry);
    return entry.firstImageUrl;
  }
  
  return undefined; // Not cached
}

// Fetch and cache image URL
export async function fetchAndCacheImageUrl(handle: string): Promise<string | null> {
  // Check cache first
  const cached = getCachedImageUrl(handle);
  if (cached !== undefined) {
    return cached;
  }
  
  // Make API call
  try {
    const res = await fetch(`/api/images/${encodeURIComponent(handle)}`);
    if (res.ok) {
      const data = await res.json();
      const entry: ImageCacheEntry = {
        handle,
        firstImageUrl: data.firstImageUrl || null,
        images: data.images || [],
        timestamp: Date.now(),
      };
      saveCache(handle, entry);
      return entry.firstImageUrl;
    }
  } catch (e) {
    // Cache null result to avoid repeated failed calls
    const entry: ImageCacheEntry = {
      handle,
      firstImageUrl: null,
      images: [],
      timestamp: Date.now(),
    };
    saveCache(handle, entry);
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

