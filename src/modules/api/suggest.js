// Public autosuggest fetchers (no API key required)
// Bing:  https://api.bing.com/osjson.aspx?query=<q>&mkt=id-ID
// DDG:   https://duckduckgo.com/ac/?q=<q>&type=list
// Brave: DEPRECATED (API down)

/**
 * Fetch suggestion strings using Bing's public autosuggest.
 */
export async function fetchSuggestionsBing(seed, mkt = 'id-ID') {
  const q = (seed || '').trim();
  if (!q) return [];
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&mkt=${encodeURIComponent(mkt)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Bing suggest failed: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data?.[1]) ? data[1] : [];
  return arr.map(s => String(s || '').toLowerCase().trim()).filter(Boolean);
}

/**
 * Fetch suggestion strings from DuckDuckGo.
 * Response format: Array of objects like { phrase: "..." }
 */
export async function fetchSuggestionsDDG(seed) {
  const q = (seed || '').trim();
  if (!q) return [];
  const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`DDG suggest failed: ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  return arr
    .map(x => (typeof x === 'string' ? x : (x && (x.phrase || x.t || x.s) || '')))
    .map(s => String(s || '').toLowerCase().trim())
    .filter(Boolean);
}

/**
 * Fetch suggestion strings from Brave.
 * Expected formats:
 *  - ["query", ["s1","s2",...]]
 *  - Or array of arrays similar to Google
 */
// Brave fetcher removed

/**
 * Fetch suggestions from all sources and merge (deduped).
 */
// Direct aggregator (network fetch here). Use this inside background.
export async function fetchAllSuggestionsDirect(seed, mkt = 'id-ID') {
  const settled = await Promise.allSettled([
    fetchSuggestionsBing(seed, mkt),
    fetchSuggestionsDDG(seed)
  ]);
  const out = new Set();
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const s of r.value) out.add(String(s));
    }
  }
  return Array.from(out);
}

// Wrapper: prefer background fetch (to avoid CORS in popup), fallback to direct Bing-only
export async function fetchAllSuggestions(seed, mkt = 'id-ID') {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const resp = await chrome.runtime.sendMessage({ type: 'FETCH_SUGGEST', seed, mkt });
      if (Array.isArray(resp)) return resp;
    }
  } catch (_) { /* ignore and fallback */ }
  // Fallback locally (Bing only to avoid CORS problems on DDG)
  try {
    const arr = await fetchSuggestionsBing(seed, mkt);
    return Array.from(new Set(arr.map(s => String(s))));
  } catch {
    return [];
  }
}

// Backward compat: default export name used elsewhere
export const fetchSuggestions = fetchSuggestionsBing;
