const BASE =
  "https://raw.githubusercontent.com/rjmlaird/rjmlaird.co.uk/master/src/data";

const CACHE_TTL = 60 * 5; // 5 minutes

/**
 * Stable cache key builder
 */
function buildCacheKey(file: string) {
  return new Request(`https://cache.rjmlaird.co.uk/data/${file}`);
}

/**
 * Fetch JSON from GitHub with:
 * - Cloudflare edge cache
 * - stale fallback support
 * - resilient error handling
 */
export async function get<T = unknown>(file: string): Promise<T> {
  const url = `${BASE}/${file}`;
  const cache = caches.default;
  const cacheKey = buildCacheKey(file);

  // ----------------------------
  // 1. EDGE CACHE
  // ----------------------------
  const cached = await cache.match(cacheKey);

  if (cached) {
    try {
      return (await cached.json()) as T;
    } catch {
      // ignore corrupted cache
    }
  }

  let res: Response;

  // ----------------------------
  // 2. FETCH GITHUB
  // ----------------------------
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch {
    if (cached) return (await cached.json()) as T;
    throw new Error(`Network error fetching ${file}`);
  }

  // ----------------------------
  // 3. HTTP ERROR HANDLING
  // ----------------------------
  if (!res.ok) {
    if (cached) return (await cached.json()) as T;
    throw new Error(`Failed to load ${file} (HTTP ${res.status})`);
  }

  // ----------------------------
  // 4. PARSE JSON
  // ----------------------------
  let data: T;

  try {
    data = (await res.json()) as T;
  } catch {
    if (cached) return (await cached.json()) as T;
    throw new Error(`Invalid JSON in ${file}`);
  }

  // ----------------------------
  // 5. WRITE CACHE
  // ----------------------------
  try {
    const responseToCache = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
      },
    });

    await cache.put(cacheKey, responseToCache.clone());
  } catch {
    // non-blocking cache failure
  }

  return data;
}

