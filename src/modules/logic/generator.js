import { fetchAllSuggestions } from "../api/suggest.js";

// Optimized topic generator with diversity enforcement
const BANNED = ['trending now on bing', 'on social media', 'in english', 'icd 10', 'yahoo', 'search ', ' now '];
const SEEDS = ['berita', 'trending', 'terbaru', 'viral', 'olahraga', 'teknologi', 'ekonomi', 'politik', 'kesehatan', 'film', 'musik', 'game', 'wisata', 'kuliner', 'startup', 'skincare', 'jakarta', 'bandung', 'bali', 'review', 'tips', 'cara'];
const POOLS = {
  actions: ['cara', 'tips', 'tutorial', 'review', 'analisis', 'prediksi', 'dampak', 'manfaat'],
  modifiers: ['terbaik', 'terburuk', 'terpopuler', 'rahasia', 'fakta', 'mitos', 'kontroversi', 'sensasi'],
  places: ['jakarta', 'surabaya', 'bandung', 'medan', 'bali', 'yogyakarta', 'makassar', 'indonesia'],
  timeframes: ['hari ini', 'minggu ini', '2024', '2025', 'terbaru', 'viral', 'trending', 'hot'],
  topics: ['politik', 'ekonomi', 'teknologi', 'olahraga', 'entertainment', 'kesehatan', 'pendidikan', 'lingkungan'],
  events: ['festival', 'konser', 'pemilihan', 'lomba', 'turnamen', 'konferensi', 'peluncuran', 'perayaan']
};

function normalize(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function wordCount(s) { return normalize(s).split(' ').filter(Boolean).length; }
function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function isValid(phrase, min = 6, max = 8) {
  const wc = wordCount(phrase);
  if (wc < min || wc > max) return false;
  const lower = phrase.toLowerCase();
  if (BANNED.some(x => lower.includes(x))) return false;
  const words = phrase.split(' ');
  return new Set(words).size === words.length; // no duplicate words
}

function createTracker() {
  const first = new Map(), firstTwo = new Map();
  return {
    canAdd: (p) => { const w = p.split(' '); return !first.has(w[0]) && !firstTwo.has(w.slice(0,2).join(' ')); },
    add: (p) => { const w = p.split(' '); first.set(w[0], 1); firstTwo.set(w.slice(0,2).join(' '), 1); }
  };
}

function expand(base, min = 6, max = 8) {
  let words = [...new Set(normalize(base).split(' '))]; // dedup
  const allPools = Object.values(POOLS).flat();
  while (words.length < min) {
    const token = getRandom(allPools);
    if (!words.includes(token)) words.push(token);
  }
  return words.slice(0, max).join(' ');
}

async function fetchPool(seeds, min) {
  const results = await Promise.allSettled(seeds.map(s => fetchAllSuggestions(s, 'id-ID')));
  const pool = new Set();
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const v of r.value) {
        const n = normalize(v);
        if (wordCount(n) >= Math.min(3, min - 2) && !BANNED.some(x => n.includes(x))) pool.add(n);
      }
    }
  }
  return pool;
}

function fillDiverse(sources, count, min, max, tracker, result) {
  for (const item of shuffle([...sources])) {
    if (result.size >= count) break;
    const phrase = typeof item === 'string' ? expand(item, min, max) : normalize(item);
    if (isValid(phrase, min, max) && tracker.canAdd(phrase) && !result.has(phrase)) {
      result.add(phrase);
      tracker.add(phrase);
    }
  }
}

export async function generateTopicsOrganicFast(count, min = 6, max = 8) {
  const pool = await fetchPool(SEEDS.slice(0, 7), min);
  const result = new Set(), tracker = createTracker();
  fillDiverse(pool, count, min, max, tracker, result);
  if (result.size < count) fillDiverse(generateLongRandomTopics(count - result.size, min, max), count, min, max, tracker, result);
  return Array.from(result).slice(0, count);
}

// Removed generateTopicsOrganic to keep only two public methods

export function generateLongRandomTopics(count, min = 6, max = 8) {
  const result = new Set(), tracker = createTracker();
  const allTokens = Object.values(POOLS).flat();
  
  for (let i = 0; i < count * 5 && result.size < count; i++) {
    const len = Math.floor(Math.random() * (max - min + 1)) + min;
    const words = [];
    for (let j = 0; j < len; j++) {
      const token = getRandom(allTokens);
      if (!words.includes(token)) words.push(token);
    }
    const phrase = words.join(' ');
    if (isValid(phrase, min, max) && tracker.canAdd(phrase)) {
      result.add(phrase);
      tracker.add(phrase);
    }
  }
  return Array.from(result);
}

// No extra exports; keep API minimal to two generator methods
